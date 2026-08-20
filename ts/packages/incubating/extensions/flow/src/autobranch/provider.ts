import { commandSucceeded } from "@nseng-ai/foundation/command";
import { z } from "zod";

import type { AutobranchGitGateway } from "./git-gateway.ts";
import type { AutobranchExec } from "./shared.ts";
import { formatAutobranchCommandDetails } from "./shared.ts";

const PROVIDER_TIMEOUT_MS = 120_000;

export type AutobranchProviderId = "graphite" | "gh-stack";

export interface AutobranchTopology {
	provider: AutobranchProviderId;
	trunk?: string;
	currentBranch: string;
	branches: readonly string[];
	children: readonly string[];
	edges: ReadonlyArray<{ parent: string; child: string }>;
}

export type ProviderInspectionResult =
	| { type: "tracked"; topology: AutobranchTopology }
	| { type: "untracked" }
	| { type: "failed"; error: string };

export type ProviderPreparationResult =
	| { type: "ready"; initialized: boolean }
	| { type: "refused-trunk"; branch: string; trunk: string }
	| { type: "refused-non-top"; branch: string; top: string }
	| { type: "failed"; error: string; initialized: boolean };

export type ProviderAddChildResult =
	| { type: "verified"; initialized: boolean }
	| { type: "absent"; error: string; initialized: boolean }
	| { type: "ambiguous"; error: string; initialized: boolean; observedChild: boolean };

export interface AutobranchProviderGateway {
	readonly id: AutobranchProviderId;
	inspectSource(sourceBranch: string): Promise<ProviderInspectionResult>;
	preflightSource(sourceBranch: string): Promise<ProviderPreparationResult>;
	prepareSource(sourceBranch: string): Promise<ProviderPreparationResult>;
	addChild(options: {
		sourceBranch: string;
		childBranch: string;
		expectedSourceSha: string;
		expectedChildSha: string;
		initialized: boolean;
	}): Promise<ProviderAddChildResult>;
}

interface CreateProviderOptions {
	exec: AutobranchExec;
	git: AutobranchGitGateway;
}

export function createGraphiteAutobranchProvider(
	options: CreateProviderOptions,
): AutobranchProviderGateway {
	return {
		id: "graphite",
		async inspectSource(sourceBranch) {
			const children = await options.exec(
				"gt",
				["children", "--no-interactive"],
				PROVIDER_TIMEOUT_MS,
			);
			if (!commandSucceeded(children)) {
				return { type: "failed", error: formatAutobranchCommandDetails(children) };
			}
			return {
				type: "tracked",
				topology: {
					provider: "graphite",
					currentBranch: sourceBranch,
					branches: [sourceBranch],
					children: nonEmptyLines(children.stdout),
					edges: [],
				},
			};
		},
		async preflightSource() {
			return { type: "ready", initialized: false };
		},
		async prepareSource() {
			return { type: "ready", initialized: false };
		},
		async addChild(input) {
			const created = await options.exec(
				"gt",
				["create", input.childBranch, "--no-interactive", "--no-ai"],
				PROVIDER_TIMEOUT_MS,
			);
			const [current, childSha] = await Promise.all([
				options.git.currentBranch(),
				options.git.branchSha(input.childBranch),
			]);
			const verified =
				current.ok &&
				current.value.type === "branch" &&
				current.value.name === input.childBranch &&
				childSha.type === "found" &&
				childSha.sha === input.expectedChildSha;
			if (commandSucceeded(created) && verified) {
				return { type: "verified", initialized: false };
			}
			const commandError = commandSucceeded(created)
				? undefined
				: formatAutobranchCommandDetails(created);
			const observedChild =
				childSha.type === "found" ||
				(current.ok && current.value.type === "branch" && current.value.name === input.childBranch);
			const error = [
				commandError,
				...(!commandSucceeded(created) && !observedChild
					? []
					: verified
						? []
						: ["Git child/current/start-point verification failed."]),
			]
				.filter((part): part is string => part !== undefined)
				.join("\n");
			return !commandSucceeded(created) && !observedChild
				? { type: "absent", error, initialized: false }
				: { type: "ambiguous", error, initialized: false, observedChild };
		},
	};
}

// github/gh-stack v0.1.0 uses omitempty for head/base and optional PR fields.
// Keep this wire schema local to the adapter; ordered branch records are the
// provider's supported relationship fact.
const ghStackViewSchema = z.object({
	trunk: z.string().min(1),
	currentBranch: z.string().min(1),
	branches: z.array(
		z.object({
			name: z.string().min(1),
			head: z.string().min(1).optional(),
			base: z.string().min(1).optional(),
			isCurrent: z.boolean(),
			isMerged: z.boolean(),
			isQueued: z.boolean(),
			needsRebase: z.boolean(),
			pr: z
				.object({
					number: z.number().int(),
					url: z.string().optional(),
					state: z.string(),
				})
				.optional(),
		}),
	),
});

export function createGhStackAutobranchProvider(
	options: CreateProviderOptions,
): AutobranchProviderGateway {
	async function inspectSource(sourceBranch: string): Promise<ProviderInspectionResult> {
		const viewed = await options.exec("gh", ["stack", "view", "--json"], PROVIDER_TIMEOUT_MS);
		if (!commandSucceeded(viewed)) {
			if (viewed.stderr.includes("is not part of a stack")) return { type: "untracked" };
			return { type: "failed", error: formatAutobranchCommandDetails(viewed) };
		}
		let decoded: unknown;
		try {
			decoded = JSON.parse(viewed.stdout);
		} catch {
			return { type: "failed", error: "gh stack view --json returned malformed JSON." };
		}
		const parsed = ghStackViewSchema.safeParse(decoded);
		if (!parsed.success) {
			return {
				type: "failed",
				error: `gh stack view --json returned an invalid topology: ${z.prettifyError(parsed.error)}`,
			};
		}
		const currentRecords = parsed.data.branches.filter((branch) => branch.isCurrent);
		if (currentRecords.length !== 1 || currentRecords[0]?.name !== parsed.data.currentBranch) {
			return {
				type: "failed",
				error: "gh stack view --json returned inconsistent current-branch topology.",
			};
		}
		if (parsed.data.currentBranch !== sourceBranch) {
			return {
				type: "failed",
				error: `gh-stack current branch is ${parsed.data.currentBranch}, expected ${sourceBranch}.`,
			};
		}
		const names = parsed.data.branches.map((branch) => branch.name);
		if (new Set(names).size !== names.length) {
			return { type: "failed", error: "gh stack view --json returned duplicate branches." };
		}
		const sourceIndex = names.indexOf(sourceBranch);
		if (sourceIndex < 0) {
			return { type: "failed", error: `gh-stack topology does not contain ${sourceBranch}.` };
		}
		const edges = parsed.data.branches.slice(1).map((branch, index) => ({
			parent: parsed.data.branches[index]?.name ?? "",
			child: branch.name,
		}));
		return {
			type: "tracked",
			topology: {
				provider: "gh-stack",
				trunk: parsed.data.trunk,
				currentBranch: parsed.data.currentBranch,
				branches: names,
				children: names.slice(sourceIndex + 1),
				edges,
			},
		};
	}

	async function checkSource(
		sourceBranch: string,
		initialize: boolean,
	): Promise<ProviderPreparationResult> {
		const inspected = await inspectSource(sourceBranch);
		if (inspected.type === "failed") {
			return { type: "failed", error: inspected.error, initialized: false };
		}
		if (inspected.type === "tracked") {
			const top = inspected.topology.branches.at(-1);
			if (top !== sourceBranch) {
				return { type: "refused-non-top", branch: sourceBranch, top: top ?? "(unknown)" };
			}
			return { type: "ready", initialized: false };
		}

		const trunk = await options.git.cachedOriginHeadBranch();
		if (trunk.type === "error") {
			return { type: "failed", error: trunk.error.message, initialized: false };
		}
		if (trunk.type === "missing") {
			return {
				type: "failed",
				error: "Could not determine Git trunk from cached refs/remotes/origin/HEAD.",
				initialized: false,
			};
		}
		if (sourceBranch === trunk.value) {
			return { type: "refused-trunk", branch: sourceBranch, trunk: trunk.value };
		}
		if (!initialize) return { type: "ready", initialized: false };
		const initialized = await options.exec(
			"gh",
			["stack", "init", sourceBranch],
			PROVIDER_TIMEOUT_MS,
		);
		if (!commandSucceeded(initialized)) {
			// init can write rerere/stack metadata before returning nonzero. Re-inspect,
			// but report retained/potential initialization even when it is not observable.
			const observed = await inspectSource(sourceBranch);
			return {
				type: "failed",
				error: [
					formatAutobranchCommandDetails(initialized),
					observed.type === "tracked"
						? "github/gh-stack initialization is observable after the failed command."
						: "github/gh-stack initialization may have retained rerere or stack metadata; inspect provider state before retrying.",
				].join("\n"),
				initialized: true,
			};
		}
		const verified = await inspectSource(sourceBranch);
		if (verified.type !== "tracked") {
			return {
				type: "failed",
				error:
					verified.type === "failed"
						? verified.error
						: "gh stack init completed but the source is still untracked.",
				initialized: true,
			};
		}
		return { type: "ready", initialized: true };
	}

	async function addChild(input: {
		sourceBranch: string;
		childBranch: string;
		expectedSourceSha: string;
		expectedChildSha: string;
		initialized: boolean;
	}): Promise<ProviderAddChildResult> {
		const added = await options.exec(
			"gh",
			["stack", "add", input.childBranch],
			PROVIDER_TIMEOUT_MS,
		);
		const commandError = commandSucceeded(added)
			? undefined
			: formatAutobranchCommandDetails(added);
		const [current, sourceSha, childSha, topology] = await Promise.all([
			options.git.currentBranch(),
			options.git.branchSha(input.sourceBranch),
			options.git.branchSha(input.childBranch),
			inspectSource(input.childBranch),
		]);
		const sourceIndex =
			topology.type === "tracked" ? topology.topology.branches.indexOf(input.sourceBranch) : -1;
		const topologyVerified =
			topology.type === "tracked" &&
			topology.topology.currentBranch === input.childBranch &&
			topology.topology.branches[sourceIndex + 1] === input.childBranch &&
			topology.topology.branches.at(-1) === input.childBranch;
		const gitVerified =
			current.ok &&
			current.value.type === "branch" &&
			current.value.name === input.childBranch &&
			sourceSha.type === "found" &&
			sourceSha.sha === input.expectedSourceSha &&
			childSha.type === "found" &&
			childSha.sha === input.expectedChildSha;
		if (commandError === undefined && topologyVerified && gitVerified) {
			return { type: "verified", initialized: input.initialized };
		}
		const observedChild = childSha.type === "found" || topologyVerified;
		const error = [
			commandError,
			...(gitVerified ? [] : ["Git child/current/start-point verification failed."]),
			...(topologyVerified
				? []
				: ["gh-stack direct source-to-child topology verification failed."]),
		]
			.filter((part): part is string => part !== undefined)
			.join("\n");
		return observedChild
			? { type: "ambiguous", error, initialized: input.initialized, observedChild: true }
			: { type: "absent", error, initialized: input.initialized };
	}

	return {
		id: "gh-stack",
		inspectSource,
		preflightSource: (sourceBranch) => checkSource(sourceBranch, false),
		prepareSource: (sourceBranch) => checkSource(sourceBranch, true),
		addChild,
	};
}

function nonEmptyLines(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

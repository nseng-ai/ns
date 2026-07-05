import {
	findLatestBranchContextEvidence,
	type BranchContextEvidence,
} from "@nseng-ai/branch-context/api";

import { CCC_WORKSPACE_OPEN_BRANCH_COMMAND_NAME } from "./command-surfaces.ts";
import { openBranchInCmuxSlot } from "./slot.ts";
import { createCccSlotClient } from "./slot-checkout.ts";
import type { SlotClient } from "@nseng-ai/slot/api";
import type {
	AutocompleteItem,
	CommandContext,
	ExtensionAPI,
} from "@nseng-ai/capability-kit/cmux/types";

interface BranchCandidate {
	name: string;
	scope: "local" | "remote";
}

type ResolvedBranch =
	| { inferred: false; branchName: string }
	| { inferred: true; branchName: string; evidence: BranchContextEvidence }
	| { error: string };

export interface CccSlotOpenBranchOptions {
	slotClient?: SlotClient;
}

export interface HandleCccSlotOpenBranchOptions {
	pi: Pick<ExtensionAPI, "exec">;
	args: string;
	ctx: CommandContext;
	options?: CccSlotOpenBranchOptions;
	notifyProgress: (message: string) => void;
}

const COMMAND_NAME = CCC_WORKSPACE_OPEN_BRANCH_COMMAND_NAME;
const MAX_COMPLETIONS = 30;
const BRANCH_FORMAT = "%(refname:short)\t%(refname)";

export async function handleCccSlotOpenBranch(
	options: HandleCccSlotOpenBranchOptions,
): Promise<void> {
	const { pi, args, ctx } = options;
	const explicitBranch = args.trim();
	options.notifyProgress(
		explicitBranch.length > 0
			? `Opening cmux workspace for ${explicitBranch}…`
			: "Resolving branch context to open…",
	);
	await ctx.waitForIdle();

	const resolved: ResolvedBranch =
		explicitBranch.length > 0
			? { branchName: explicitBranch, inferred: false }
			: await resolveInferredBranchContext(ctx);

	if ("error" in resolved) {
		ctx.ui.notify(resolved.error, "error");
		return;
	}

	if (resolved.inferred) {
		const confirmed = await confirmInferredBranch(ctx, resolved.evidence);
		if (!confirmed) {
			ctx.ui.notify("Cancelled; no cmux workspace was opened.", "info");
			return;
		}
	}

	const branch = resolved.branchName;
	if (resolved.inferred) {
		options.notifyProgress(`Opening cmux workspace for ${branch}…`);
	}

	const launched = await openBranchInCmuxSlot({
		pi,
		cwd: ctx.cwd,
		branchName: branch,
		slotClient: options.options?.slotClient ?? createCccSlotClient({ cwd: ctx.cwd }),
		notify: (message, level) => ctx.ui.notify(message, level),
	});
	if ("error" in launched) {
		return;
	}
}

async function resolveInferredBranchContext(ctx: {
	sessionManager?: { getBranch?: () => unknown[] };
}): Promise<
	{ inferred: true; branchName: string; evidence: BranchContextEvidence } | { error: string }
> {
	const entries = ctx.sessionManager?.getBranch?.() ?? [];
	const evidence = findLatestBranchContextEvidence(entries);
	if (!evidence) {
		return {
			error: `Usage: /${COMMAND_NAME} <branch>\nNo latest [branch-context-output] branch found in the current session branch.`,
		};
	}
	return { inferred: true, branchName: evidence.branch, evidence };
}

async function confirmInferredBranch(
	ctx: {
		hasUI?: boolean;
		ui: {
			confirm?: (title: string, message: string) => Promise<boolean>;
			notify(message: string, level?: "info" | "warning" | "error"): void;
		};
	},
	evidence: BranchContextEvidence,
): Promise<boolean> {
	if (!ctx.hasUI || ctx.ui.confirm === undefined) {
		ctx.ui.notify(
			`Cannot infer /${COMMAND_NAME} branch without an interactive confirmation UI.`,
			"error",
		);
		return false;
	}

	const details = formatInferredBranchConfirmation(evidence);
	return ctx.ui.confirm("Use branch context?", details);
}

function formatInferredBranchConfirmation(evidence: BranchContextEvidence): string {
	return [
		`Use branch "${evidence.branch}" from the latest [branch-context-output] and open it in a new cmux workspace?`,
		"",
		`Key: ${evidence.key}`,
		`Branch creation: ${evidence.branchCreation}`,
		`Start point: ${evidence.startPoint}`,
		`Commit: ${evidence.commit}`,
		`Source file: ${evidence.sourceFile}`,
	].join("\n");
}

export function extractCommandArgumentPrefix(textBeforeCursor: string): string | undefined {
	const commandPrefix = `/${COMMAND_NAME}`;
	if (!textBeforeCursor.startsWith(commandPrefix)) {
		return undefined;
	}

	const rest = textBeforeCursor.slice(commandPrefix.length);
	if (!rest.startsWith(" ")) {
		return undefined;
	}

	const argumentPrefix = rest.slice(1);
	return /\s/.test(argumentPrefix.trim()) ? undefined : argumentPrefix;
}

export async function getBranchCompletions(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	argumentPrefix: string,
): Promise<AutocompleteItem[]> {
	const trimmedPrefix = argumentPrefix.trim();
	if (/\s/.test(trimmedPrefix)) {
		return [];
	}

	const candidates = await listBranchCandidates(pi, cwd);
	if (!candidates) {
		return [];
	}

	return filterBranchCandidates(candidates, trimmedPrefix)
		.slice(0, MAX_COMPLETIONS)
		.map((candidate) => ({
			value: candidate.name,
			label: candidate.name,
			description: candidate.scope,
		}));
}

async function listBranchCandidates(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
): Promise<BranchCandidate[] | undefined> {
	const result = await pi.exec(
		"git",
		["for-each-ref", `--format=${BRANCH_FORMAT}`, "refs/heads", "refs/remotes"],
		{ cwd, timeout: 5_000 },
	);
	if (result.code !== 0) {
		return undefined;
	}

	const seen = new Set<string>();
	const candidates: BranchCandidate[] = [];
	for (const line of result.stdout.split("\n")) {
		const trimmedLine = line.trim();
		if (trimmedLine.length === 0) {
			continue;
		}

		const [name, ref] = trimmedLine.split("\t");
		if (!name || !ref || name.endsWith("/HEAD")) {
			continue;
		}
		if (seen.has(name)) {
			continue;
		}

		seen.add(name);
		candidates.push({
			name,
			scope: ref.startsWith("refs/heads/") ? "local" : "remote",
		});
	}

	return candidates;
}

function filterBranchCandidates(candidates: BranchCandidate[], prefix: string): BranchCandidate[] {
	if (prefix.length === 0) {
		return sortBranchCandidates(candidates);
	}

	const exactMatches = candidates.filter((candidate) => candidate.name === prefix);
	if (exactMatches.length > 0) {
		return sortBranchCandidates(exactMatches);
	}

	const prefixMatches = candidates.filter((candidate) => candidate.name.startsWith(prefix));
	if (prefixMatches.length > 0) {
		return sortBranchCandidates(prefixMatches);
	}

	return sortBranchCandidates(candidates.filter((candidate) => candidate.name.includes(prefix)));
}

function sortBranchCandidates(candidates: BranchCandidate[]): BranchCandidate[] {
	return [...candidates].sort((left, right) => {
		if (left.scope !== right.scope) {
			return left.scope === "local" ? -1 : 1;
		}
		return left.name.localeCompare(right.name);
	});
}

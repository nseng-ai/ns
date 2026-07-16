/**
 * Herdr open-branch: check out an existing branch in a new Herdr workspace.
 *
 * Mirrors the cmux workspace:open-branch workflow with Herdr-native workspace
 * opening. Preserves explicit branch selection, inference from branch-context
 * evidence, confirmation, tab completions, and ns slot checkout.
 *
 * ns owns: slot checkout, branch-context inference.
 * Herdr owns: workspace creation.
 */
import {
	findLatestBranchContextEvidence,
	type BranchContextEvidence,
} from "@nseng-ai/branch-context/api";
import { commandSucceeded, type CommandExecApi } from "@nseng-ai/foundation/command";
import type { AutocompleteItem, CommandContext } from "@nseng-ai/capability-kit/pi-types";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_WORKSPACE_OPEN_BRANCH_COMMAND_NAME } from "./command-surfaces.ts";
import { openBranchInHerdrWorkspace } from "./slot.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";

const COMMAND_NAME = HERDR_WORKSPACE_OPEN_BRANCH_COMMAND_NAME;
const MAX_COMPLETIONS = 30;
const BRANCH_FORMAT = "%(refname:short)\t%(refname)";

interface BranchCandidate {
	name: string;
	scope: "local" | "remote";
}

type ResolvedBranch =
	| { inferred: false; branchName: string }
	| { inferred: true; branchName: string; evidence: BranchContextEvidence }
	| { error: string };

export interface HerdrSlotOpenBranchOptions {
	slotClient?: SlotClient;
}

export interface HandleHerdrSlotOpenBranchOptions {
	pi: CommandExecApi;
	herdr: HerdrGateway;
	args: string;
	ctx: CommandContext;
	options?: HerdrSlotOpenBranchOptions;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrSlotOpenBranch(
	options: HandleHerdrSlotOpenBranchOptions,
): Promise<void> {
	const { pi, herdr, args, ctx } = options;
	const explicitBranch = args.trim();
	options.notifyProgress(
		explicitBranch.length > 0
			? `Opening Herdr workspace for ${explicitBranch}…`
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
			ctx.ui.notify("Cancelled; no Herdr workspace was opened.", "info");
			return;
		}
	}

	const branch = resolved.branchName;
	if (resolved.inferred) {
		options.notifyProgress(`Opening Herdr workspace for ${branch}…`);
	}

	await openBranchInHerdrWorkspace({
		pi,
		herdr,
		cwd: ctx.cwd,
		branchName: branch,
		slotClient: options.options?.slotClient ?? createHerdrSlotClient({ cwd: ctx.cwd }),
		notify: (message, level) => ctx.ui.notify(message, level),
		notifyProgress: options.notifyProgress,
	});
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
	return ctx.ui.confirm(
		"Use branch context?",
		[
			`Use branch "${evidence.branch}" from the latest [branch-context-output] and open it in a new Herdr workspace?`,
			"",
			`Key: ${evidence.key}`,
			`Branch creation: ${evidence.branchCreation}`,
			`Start point: ${evidence.startPoint}`,
			`Commit: ${evidence.commit}`,
			`Source file: ${evidence.sourceFile}`,
		].join("\n"),
	);
}

export function extractCommandArgumentPrefix(textBeforeCursor: string): string | undefined {
	const commandPrefix = `/${COMMAND_NAME}`;
	if (!textBeforeCursor.startsWith(commandPrefix)) return undefined;
	const rest = textBeforeCursor.slice(commandPrefix.length);
	if (!rest.startsWith(" ")) return undefined;
	const argumentPrefix = rest.slice(1);
	return /\s/.test(argumentPrefix.trim()) ? undefined : argumentPrefix;
}

export async function getBranchCompletions(
	pi: CommandExecApi,
	cwd: string,
	argumentPrefix: string,
): Promise<AutocompleteItem[]> {
	const trimmedPrefix = argumentPrefix.trim();
	if (/\s/.test(trimmedPrefix)) return [];

	const candidates = await listBranchCandidates(pi, cwd);
	if (!candidates) return [];

	return filterBranchCandidates(candidates, trimmedPrefix)
		.slice(0, MAX_COMPLETIONS)
		.map((c) => ({ value: c.name, label: c.name, description: c.scope }));
}

async function listBranchCandidates(
	pi: CommandExecApi,
	cwd: string,
): Promise<BranchCandidate[] | undefined> {
	const result = await pi.exec(
		"git",
		["for-each-ref", `--format=${BRANCH_FORMAT}`, "refs/heads", "refs/remotes"],
		{ cwd, timeout: 5_000 },
	);
	if (!commandSucceeded(result)) return undefined;

	const seen = new Set<string>();
	const candidates: BranchCandidate[] = [];
	for (const line of result.stdout.split("\n")) {
		const trimmedLine = line.trim();
		if (trimmedLine.length === 0) continue;
		const [name, ref] = trimmedLine.split("\t");
		if (!name || !ref || name.endsWith("/HEAD")) continue;
		if (seen.has(name)) continue;
		seen.add(name);
		candidates.push({
			name,
			scope: ref.startsWith("refs/heads/") ? "local" : "remote",
		});
	}
	return candidates;
}

function filterBranchCandidates(candidates: BranchCandidate[], prefix: string): BranchCandidate[] {
	if (prefix.length === 0) return sortBranchCandidates(candidates);
	const exactMatches = candidates.filter((c) => c.name === prefix);
	if (exactMatches.length > 0) return sortBranchCandidates(exactMatches);
	const prefixMatches = candidates.filter((c) => c.name.startsWith(prefix));
	if (prefixMatches.length > 0) return sortBranchCandidates(prefixMatches);
	return sortBranchCandidates(candidates.filter((c) => c.name.includes(prefix)));
}

function sortBranchCandidates(candidates: BranchCandidate[]): BranchCandidate[] {
	return [...candidates].sort((l, r) => {
		if (l.scope !== r.scope) return l.scope === "local" ? -1 : 1;
		return l.name.localeCompare(r.name);
	});
}

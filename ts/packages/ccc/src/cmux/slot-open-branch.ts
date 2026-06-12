import { extractPlannedBranchEvidenceFromSessionEntry } from "@asdl/planned-branch";

import { openBranchInCmuxSlot } from "./slot.ts";
import type {
	AutocompleteItem,
	AutocompleteProvider,
	AutocompleteSuggestions,
	CommandContext,
	ExtensionAPI,
} from "./types.ts";

interface BranchCandidate {
	name: string;
	scope: "local" | "remote";
}

interface PlannedBranchSelection {
	branchName: string;
	key?: string;
	commit?: string;
	sourceFile?: string;
	branchCreation?: string;
	startPoint?: string;
}

type ResolvedBranch =
	| { inferred: false; branchName: string }
	| { inferred: true; branchName: string; selection: PlannedBranchSelection }
	| { error: string };

export interface HandleCccSlotOpenBranchOptions {
	pi: Pick<ExtensionAPI, "exec">;
	args: string;
	ctx: CommandContext;
}

const COMMAND_NAME = "ccc:workspace:open-branch";
const MAX_COMPLETIONS = 30;
const BRANCH_FORMAT = "%(refname:short)\t%(refname)";

export function registerCccSlotOpenBranchCommand(pi: ExtensionAPI): void {
	let currentCwd = process.cwd();

	pi.on("session_start", async (_event, ctx) => {
		currentCwd = ctx.cwd;
		ctx.ui.addAutocompleteProvider?.((current) => createBranchAutocompleteProvider(pi, current, ctx.cwd));
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Open a branch, or the latest planned branch when omitted, in a new cmux workspace.",
		argumentHint: "[branch]",
		getArgumentCompletions: async (argumentPrefix) => {
			const completions = await getBranchCompletions(pi, currentCwd, argumentPrefix);
			return completions.length > 0 ? completions : null;
		},
		handler: async (args, ctx) => {
			await handleCccSlotOpenBranch({ pi, args, ctx });
		},
	});
}

export async function handleCccSlotOpenBranch(options: HandleCccSlotOpenBranchOptions): Promise<void> {
	const { pi, args, ctx } = options;
	await ctx.waitForIdle();

	const explicitBranch = args.trim();
	const resolved: ResolvedBranch =
		explicitBranch.length > 0
			? { branchName: explicitBranch, inferred: false }
			: await resolveInferredPlannedBranch(ctx);

	if ("error" in resolved) {
		ctx.ui.notify(resolved.error, "error");
		return;
	}

	if (resolved.inferred) {
		const confirmed = await confirmInferredBranch(ctx, resolved.selection);
		if (!confirmed) {
			ctx.ui.notify("Cancelled; no cmux workspace was opened.", "info");
			return;
		}
	}

	const branch = resolved.branchName;
	ctx.ui.notify(`Opening cmux workspace for ${branch}…`, "info");

	const launched = await openBranchInCmuxSlot({
		pi,
		cwd: ctx.cwd,
		branchName: branch,
		notify: (message, level) => ctx.ui.notify(message, level),
	});
	if ("error" in launched) {
		return;
	}
}

async function resolveInferredPlannedBranch(ctx: {
	sessionManager?: { getBranch?: () => unknown[] };
}): Promise<
	| { inferred: true; branchName: string; selection: PlannedBranchSelection }
	| { error: string }
> {
	const entries = ctx.sessionManager?.getBranch?.() ?? [];
	const selection = findLatestPlannedBranchSelection(entries);
	if (!selection) {
		return {
			error: `Usage: /${COMMAND_NAME} <branch>\nNo latest [planned-branch-output] branch found in the current session branch.`,
		};
	}
	return { inferred: true, branchName: selection.branchName, selection };
}

export function findLatestPlannedBranchSelection(entries: unknown[]): PlannedBranchSelection | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const selection = extractPlannedBranchSelection(entries[index]);
		if (selection !== undefined) {
			return selection;
		}
	}
	return undefined;
}

function extractPlannedBranchSelection(entry: unknown): PlannedBranchSelection | undefined {
	const evidence = extractPlannedBranchEvidenceFromSessionEntry(entry);
	if (evidence === undefined) {
		return undefined;
	}

	return {
		branchName: evidence.branch,
		key: evidence.key,
		commit: evidence.commit,
		sourceFile: evidence.sourceFile,
		branchCreation: evidence.branchCreation,
		startPoint: evidence.startPoint,
	};
}

async function confirmInferredBranch(
	ctx: {
		hasUI?: boolean;
		ui: {
			confirm?: (title: string, message: string) => Promise<boolean>;
			notify(message: string, level?: "info" | "warning" | "error"): void;
		};
	},
	selection: PlannedBranchSelection,
): Promise<boolean> {
	if (!ctx.hasUI || ctx.ui.confirm === undefined) {
		ctx.ui.notify(`Cannot infer /${COMMAND_NAME} branch without an interactive confirmation UI.`, "error");
		return false;
	}

	const details = formatInferredBranchConfirmation(selection);
	return ctx.ui.confirm("Use planned branch?", details);
}

function formatInferredBranchConfirmation(selection: PlannedBranchSelection): string {
	return [
		`Use branch "${selection.branchName}" from the latest [planned-branch-output] and open it in a new cmux workspace?`,
		"",
		selection.key ? `Key: ${selection.key}` : undefined,
		selection.branchCreation ? `Branch creation: ${selection.branchCreation}` : undefined,
		selection.startPoint ? `Start point: ${selection.startPoint}` : undefined,
		selection.commit ? `Commit: ${selection.commit}` : undefined,
		selection.sourceFile ? `Source file: ${selection.sourceFile}` : undefined,
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

function createBranchAutocompleteProvider(
	pi: Pick<ExtensionAPI, "exec">,
	current: AutocompleteProvider,
	cwd: string,
): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			const currentLine = lines[cursorLine] ?? "";
			const textBeforeCursor = currentLine.slice(0, cursorCol);
			const argumentPrefix = extractCommandArgumentPrefix(textBeforeCursor);
			if (argumentPrefix === undefined) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const completions = await getBranchCompletions(pi, cwd, argumentPrefix);
			if (options.signal.aborted || completions.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			return {
				items: completions,
				prefix: argumentPrefix,
			};
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
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

async function listBranchCandidates(pi: Pick<ExtensionAPI, "exec">, cwd: string): Promise<BranchCandidate[] | undefined> {
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

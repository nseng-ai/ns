import { checkoutSlot, openCmuxWorkspace } from "./slot.ts";
import type { CmuxWorkspaceSummaryController } from "./workspace-summary.ts";
import { getWorktreeDescription } from "./worktree-description.ts";
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

interface LoosePlannedBranchSelection {
	branchName: string;
	key?: string | undefined;
	commit?: string | undefined;
	sourceFile?: string | undefined;
	branchCreation?: string | undefined;
	startPoint?: string | undefined;
}

type ResolvedBranch =
	| { inferred: false; branchName: string }
	| { inferred: true; branchName: string; selection: PlannedBranchSelection }
	| { error: string };

export interface HandleCmuxSlotOpenBranchOptions {
	pi: Pick<ExtensionAPI, "exec">;
	summaryController: CmuxWorkspaceSummaryController;
	args: string;
	ctx: CommandContext;
}

const COMMAND_NAME = "cmux-slot:open-branch";
const MAX_COMPLETIONS = 30;
const BRANCH_FORMAT = "%(refname:short)\t%(refname)";

export function registerCmuxSlotOpenBranchCommand(
	pi: ExtensionAPI,
	summaryController: CmuxWorkspaceSummaryController,
): void {
	let currentCwd = process.cwd();

	pi.on("session_start", async (_event, ctx) => {
		currentCwd = ctx.cwd;
		ctx.ui.addAutocompleteProvider?.((current) => createBranchAutocompleteProvider(pi, current, ctx.cwd));
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Open a branch, or the latest planned branch when omitted, in a CMUX slot.",
		argumentHint: "[branch]",
		getArgumentCompletions: async (argumentPrefix) => {
			const completions = await getBranchCompletions(pi, currentCwd, argumentPrefix);
			return completions.length > 0 ? completions : null;
		},
		handler: async (args, ctx) => {
			await handleCmuxSlotOpenBranch({ pi, summaryController, args, ctx });
		},
	});
}

export async function handleCmuxSlotOpenBranch(options: HandleCmuxSlotOpenBranchOptions): Promise<void> {
	const { pi, summaryController, args, ctx } = options;
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
			ctx.ui.notify("Cancelled; no CMUX slot was opened.", "info");
			return;
		}
	}

	const branch = resolved.branchName;
	ctx.ui.notify(`Opening ${branch} in a CMUX slot…`, "info");

	const target = await checkoutSlot(pi, ctx.cwd, branch);
	if ("error" in target) {
		ctx.ui.notify(target.error, "error");
		return;
	}

	const description = await getWorktreeDescription(pi, target.worktreePath, target.branchName);
	const launched = await openCmuxWorkspace(pi, target, {
		description,
		failureHeading: "Checked out the branch into a slot, but failed to open the CMUX workspace.",
		failureDetails: [`Worktree: ${target.worktreePath}`],
	});
	if ("error" in launched) {
		ctx.ui.notify(launched.error, "error");
		return;
	}

	ctx.ui.notify(`Opened branch in CMUX slot: ${target.branchName}`, "info");
	await summaryController.queuePrFromHook(ctx);
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
	const message = extractMessageFromEntry(entry);
	if (message === undefined) {
		return undefined;
	}

	return extractStructuredPlannedBranchSelection(message) ?? extractTextPlannedBranchSelection(message);
}

function extractStructuredPlannedBranchSelection(
	message: Record<string, unknown>,
): PlannedBranchSelection | undefined {
	if (customTypeFromMessage(message) !== "planned-branch-output") {
		return undefined;
	}

	const details = isRecord(message.details) ? message.details : undefined;
	if (!details || details.status !== "success") {
		return undefined;
	}

	const evidence = isRecord(details.evidence) ? details.evidence : undefined;
	const branchName = stringField(evidence, "branch")?.trim();
	if (!branchName) {
		return undefined;
	}

	return withoutUndefinedProperties({
		branchName,
		key: stringField(evidence, "key"),
		commit: stringField(evidence, "commit"),
		sourceFile: stringField(evidence, "sourceFile"),
		branchCreation: stringField(evidence, "branchCreation"),
		startPoint: stringField(evidence, "startPoint"),
	});
}

function extractTextPlannedBranchSelection(message: Record<string, unknown>): PlannedBranchSelection | undefined {
	if (hasNonSuccessStructuredStatus(message)) {
		return undefined;
	}

	const text = contentText(message.content);
	const customType = customTypeFromMessage(message);
	const hasTextMarker =
		text.includes("[planned-branch-output]") || text.includes("Created planned branch and attached plan.");
	const hasPlannedBranchMarker =
		customType === "planned-branch-output" || (isCustomLikeMessage(message) && hasTextMarker);
	if (!hasPlannedBranchMarker || isClearNonSuccessPlannedBranchText(text)) {
		return undefined;
	}

	const branchName = parseLabeledLine(text, "Branch");
	if (!branchName) {
		return undefined;
	}

	return withoutUndefinedProperties({
		branchName,
		key: parseLabeledLine(text, "Key"),
		commit: parseLabeledLine(text, "Commit"),
		sourceFile: parseLabeledLine(text, "Source file"),
		branchCreation: parseLabeledLine(text, "Branch creation"),
		startPoint: parseLabeledLine(text, "Start point"),
	});
}

function withoutUndefinedProperties(selection: LoosePlannedBranchSelection): PlannedBranchSelection {
	const cleaned: PlannedBranchSelection = { branchName: selection.branchName };
	if (selection.key !== undefined) cleaned.key = selection.key;
	if (selection.commit !== undefined) cleaned.commit = selection.commit;
	if (selection.sourceFile !== undefined) cleaned.sourceFile = selection.sourceFile;
	if (selection.branchCreation !== undefined) cleaned.branchCreation = selection.branchCreation;
	if (selection.startPoint !== undefined) cleaned.startPoint = selection.startPoint;
	return cleaned;
}

function hasNonSuccessStructuredStatus(message: Record<string, unknown>): boolean {
	const details = isRecord(message.details) ? message.details : undefined;
	return details?.status !== undefined && details.status !== "success";
}

function isClearNonSuccessPlannedBranchText(text: string): boolean {
	return /^Dry run:\s*/m.test(text) || /Failed to create planned branch/i.test(text);
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
		ctx.ui.notify("Cannot infer /cmux-slot:open-branch branch without an interactive confirmation UI.", "error");
		return false;
	}

	const details = formatInferredBranchConfirmation(selection);
	return ctx.ui.confirm("Use planned branch?", details);
}

function formatInferredBranchConfirmation(selection: PlannedBranchSelection): string {
	return [
		`Use branch "${selection.branchName}" from the latest [planned-branch-output] and open it in a CMUX slot?`,
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

function extractMessageFromEntry(entry: unknown): Record<string, unknown> | undefined {
	if (!isRecord(entry)) {
		return undefined;
	}
	if (isRecord(entry.message)) {
		return entry.message;
	}
	if (typeof entry.customType === "string" || entry.content !== undefined) {
		return entry;
	}
	return undefined;
}

function customTypeFromMessage(message: Record<string, unknown>): string | undefined {
	return typeof message.customType === "string" ? message.customType : undefined;
}

function isCustomLikeMessage(message: Record<string, unknown>): boolean {
	return (
		customTypeFromMessage(message) !== undefined ||
		message.role === "custom" ||
		message.display !== undefined
	);
}

function contentText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (!Array.isArray(value)) {
		return "";
	}
	return value
		.map((block) => (isRecord(block) && block.type === "text" && typeof block.text === "string" ? block.text : ""))
		.filter((text) => text.length > 0)
		.join("\n");
}

function parseLabeledLine(text: string, label: string): string | undefined {
	const match = text.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+?)\\s*$`, "m"));
	return match?.[1]?.trim() || undefined;
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = record?.[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const COMMAND_NAME = "land-stack";
const STATUS_KEY = "land-stack";
const COMMAND_STREAM_MESSAGE_TYPE = "land-stack-command-stream";

const GIT_TIMEOUT_MS = 30_000;
const GH_TIMEOUT_MS = 30_000;
const GH_MERGE_TIMEOUT_MS = 120_000;
const GT_TIMEOUT_MS = 120_000;
const GT_MUTATION_TIMEOUT_MS = 600_000;
const SLOT_TIMEOUT_MS = 120_000;

const CURRENT_MARKER = "◉";
const OTHER_MARKER = "◯";
const PR_FIELDS = "number,title,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt";

const MAX_OUTPUT_TAIL_LINES = 40;
const MAX_OUTPUT_TAIL_CHARS = 4_000;
const MAX_COMMAND_STREAM_OUTPUT_LINES = 4;

export type NotifyLevel = "info" | "success" | "warning" | "error";

export type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
};

type PiExecResult = {
	stdout?: string;
	stderr?: string;
	code: number;
	killed?: boolean;
};

export type AutocompleteItem = {
	value: string;
	label?: string;
	description?: string;
};

type CustomMessageContent = string | Array<{ type: string; text?: string }>;

type CustomMessage = {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
};

type RenderTheme = {
	fg(color: string, text: string): string;
};

type RenderComponent = {
	render(width: number): string[];
	invalidate(): void;
};

type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

export type ExtensionCommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		confirm(title: string, message: string): Promise<boolean>;
		setStatus(key: string, value: string | undefined): void;
		setWidget?(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(
		message: CustomMessage,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<PiExecResult>;
};

export type ParsedArgs = {
	yes: boolean;
	dryRun: boolean;
	help: boolean;
};

export type StackSnapshot = {
	trunk: string;
	current: string;
	landingBranches: string[];
	descendantBranches: string[];
	warnings: string[];
};

export type PullRequestSnapshot = {
	number: number;
	title: string;
	state: string;
	isDraft: boolean;
	headRefName: string;
	baseRefName: string;
	headRefOid: string;
	mergeStateStatus: string | undefined;
	url: string | undefined;
	mergedAt: string | null | undefined;
};

export type BranchPlan = {
	branch: string;
	localSha: string;
	pr: PullRequestSnapshot;
};

export type PrSubmitRequirement = {
	branch: string;
	prNumber: number;
	localSha: string;
	prHeadSha: string;
	baseRefName: string;
	expectedBaseRefName: string | undefined;
	reasons: string[];
};

export type WorktreeConflict = {
	branch: string;
	path: string;
	kind: "current" | "managed-slot" | "manual-worktree";
};

export type WorktreeEntry = {
	path: string;
	branch?: string;
};

export type ParsedStackOutput = {
	trunk: string;
	current: string;
	ancestors: string[];
	descendants: string[];
	warnings: string[];
};

export type LandingPlan = {
	repoRoot: string;
	stack: StackSnapshot;
	branchPlans: BranchPlan[];
	prSubmitRequirements: PrSubmitRequirement[];
	managedSlotConflicts: WorktreeConflict[];
};

export type LandedPr = {
	branch: string;
	number: number;
	title: string;
};

export type LandStackErrorOptions = {
	level?: NotifyLevel;
	commandDisplay?: string;
	result?: ExecResult;
	failedBranch?: string;
	failedPr?: number;
	suggestedAction?: string;
};

export class LandStackError extends Error {
	readonly level: NotifyLevel;
	readonly commandDisplay: string | undefined;
	readonly result: ExecResult | undefined;
	readonly failedBranch: string | undefined;
	readonly failedPr: number | undefined;
	readonly suggestedAction: string | undefined;

	constructor(message: string, options: LandStackErrorOptions = {}) {
		super(message);
		this.name = "LandStackError";
		this.level = options.level ?? "error";
		this.commandDisplay = options.commandDisplay;
		this.result = options.result;
		this.failedBranch = options.failedBranch;
		this.failedPr = options.failedPr;
		this.suggestedAction = options.suggestedAction;
	}
}

type CommandStreamFinish = {
	result: ExecResult;
	note?: string;
};

class LandStackCommandStream {
	constructor(
		private readonly pi: ExtensionAPI,
		private readonly ctx: ExtensionCommandContext,
	) {}

	start(_commandDisplay: string): void {
		// The active operation is already reflected in the status line. Only completed
		// command results are appended to chat so the log scrolls naturally instead of
		// pinning a rewritten widget above the editor.
	}

	finish(commandDisplay: string, finish: CommandStreamFinish): void {
		const result = finish.result;
		const icon = result.code === 0 ? "✓" : "✗";
		const suffix =
			result.code === 0
				? finish.note
					? ` — ${finish.note}`
					: ""
				: ` — exit ${result.code}${result.killed ? " (killed or timed out)" : ""}`;
		const lines = [`${icon} $ ${commandDisplay}${suffix}`];
		if (result.code !== 0) {
			lines.push(...commandStreamOutputLines(result));
		}
		this.append(lines.join("\n"));
	}

	finishSuccess(message: string): void {
		this.append(formatCommandStreamBlock("✓", message));
	}

	finishFailure(message: string): void {
		this.append(formatCommandStreamBlock("✗", message));
	}

	private append(message: string): void {
		if (!this.ctx.hasUI || !this.pi.sendMessage) return;
		this.pi.sendMessage({
			customType: COMMAND_STREAM_MESSAGE_TYPE,
			content: message,
			display: true,
		});
	}
}

export default function landStackExtension(pi: ExtensionAPI): void {
	pi.registerMessageRenderer?.(COMMAND_STREAM_MESSAGE_TYPE, renderCommandStreamMessage);

	pi.registerCommand(COMMAND_NAME, {
		description: "Land the current Graphite stack path bottom-to-current, one PR at a time",
		getArgumentCompletions: (prefix: string) => {
			const options = ["--yes", "--dry-run", "--help"];
			const token = prefix.trim().split(/\s+/).pop() ?? "";
			const filtered = options.filter((option) => option.startsWith(token));
			return filtered.length > 0 ? filtered.map((option) => ({ value: option, label: option })) : null;
		},
		handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
			await ctx.waitForIdle();

			const landed: LandedPr[] = [];
			const commandStream = new LandStackCommandStream(pi, ctx);
			const runtimePi = withCommandStreaming(pi, commandStream);
			try {
				const args = parseArgs(rawArgs);
				if (args.help) {
					present(ctx, usage(), "info");
					return;
				}

				setStatus(ctx, "preflighting...");
				let plan = await buildLandingPlan(runtimePi, ctx.cwd, { allowSubmitRequiredState: true });
				const planText = formatPlan(plan);

				if (args.dryRun) {
					commandStream.finishSuccess("Dry run only; no PRs or local refs were changed.");
					present(ctx, `Dry run only; no PRs or local refs were changed.\n\n${planText}`, "info");
					return;
				}

				if (!args.yes) {
					if (!ctx.hasUI) {
						fail(`Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${planText}`);
					}
					const confirmed = await ctx.ui.confirm("Land this stack path?", planText);
					if (!confirmed) {
						fail("Cancelled before merge; no PRs were landed.", { level: "info" });
					}
				}

				if (plan.prSubmitRequirements.length > 0) {
					await confirmAndSubmitRequiredPrUpdates(runtimePi, ctx, plan);
					setStatus(ctx, "rechecking preflight...");
					plan = await buildLandingPlan(runtimePi, ctx.cwd, { allowSubmitRequiredState: true });
					if (plan.prSubmitRequirements.length > 0) {
						fail(formatRemainingSubmitRequirements(plan.prSubmitRequirements), {
							suggestedAction: `Run ${formatCommand("gt", submitUpdateArgs(plan.stack.current))} manually, inspect PR heads, and rerun /land-stack.`,
						});
					}
				}

				if (plan.managedSlotConflicts.length > 0) {
					await confirmAndFreeManagedSlots(runtimePi, ctx, plan);
				}

				await runMergeLoop(runtimePi, ctx, plan, landed);

				const successSummary = formatSuccessSummary(landed, plan.stack.descendantBranches);
				commandStream.finishSuccess(successSummary);
				presentBrief(ctx, successSummary, "success", formatSuccessNotification(successSummary));
			} catch (error) {
				const formatted = formatFailure(error, landed);
				const level = error instanceof LandStackError ? error.level : "error";
				commandStream.finishFailure(formatted);
				presentBrief(ctx, formatted, level, formatFailureNotification(error));
			} finally {
				setStatus(ctx, undefined);
			}
		},
	});
}

export function parseArgs(argsText: string): ParsedArgs {
	const parsed: ParsedArgs = { yes: false, dryRun: false, help: false };
	const parts = argsText.trim().split(/\s+/).filter(Boolean);

	for (const part of parts) {
		if (part === "--yes" || part === "-y") {
			parsed.yes = true;
		} else if (part === "--dry-run") {
			parsed.dryRun = true;
		} else if (part === "--help" || part === "-h") {
			parsed.help = true;
		} else {
			fail(`Unknown /${COMMAND_NAME} argument: ${part}\n\n${usage()}`);
		}
	}

	return parsed;
}

async function buildLandingPlan(
	pi: ExtensionAPI,
	cwd: string,
	options: { allowSubmitRequiredState?: boolean } = {},
): Promise<LandingPlan> {
	const repoRoot = await loadRepoRoot(pi, cwd);
	const current = await loadCurrentBranch(pi, repoRoot);
	const trunk = await loadTrunk(pi, repoRoot);
	const stack = await loadStackSnapshot(pi, repoRoot, current, trunk);

	if (stack.current === stack.trunk || stack.landingBranches.length === 0) {
		fail(`Current branch is ${stack.current}, which is trunk or has no PR path to land. Nothing to do.`, { level: "info" });
	}

	await assertCleanRepo(pi, repoRoot);

	const relevantBranches = unique([...stack.landingBranches, ...stack.descendantBranches]);
	for (const branch of relevantBranches) {
		await assertLocalBranchExists(pi, repoRoot, branch);
	}

	const branchPlans: BranchPlan[] = [];
	for (const branch of stack.landingBranches) {
		const localSha = await loadLocalSha(pi, repoRoot, branch);
		const pr = await loadPr(pi, repoRoot, branch);
		branchPlans.push({ branch, localSha, pr });
	}
	validateInitialPrPreflight(branchPlans, stack.trunk, { allowSubmitRequiredState: Boolean(options.allowSubmitRequiredState) });
	const prSubmitRequirements = collectPrSubmitRequirements(branchPlans, stack.trunk);

	const conflicts = await detectWorktreeConflicts(pi, repoRoot, current, relevantBranches);
	const manualConflicts = conflicts.filter((conflict) => conflict.kind === "manual-worktree");
	if (manualConflicts.length > 0) {
		fail(formatManualWorktreeConflict(manualConflicts), {
			suggestedAction: "Detach those worktrees or check out unrelated branches, then rerun /land-stack.",
		});
	}

	return {
		repoRoot,
		stack,
		branchPlans,
		prSubmitRequirements,
		managedSlotConflicts: conflicts.filter((conflict) => conflict.kind === "managed-slot"),
	};
}

async function confirmAndSubmitRequiredPrUpdates(pi: ExtensionAPI, ctx: ExtensionCommandContext, plan: LandingPlan): Promise<void> {
	const submitArgs = submitUpdateArgs(plan.stack.current);
	const details = formatSubmitUpdateDetails(plan);

	if (!ctx.hasUI) {
		fail(
			[
				"GitHub PR metadata is behind local Graphite refs, but this context cannot ask for the required submit/update confirmation.",
				details,
				`No PRs were landed. Run ${formatCommand("gt", submitArgs)} manually, then rerun /land-stack --yes.`,
			].join("\n"),
			{ suggestedAction: `Run ${formatCommand("gt", submitArgs)} manually, then rerun /land-stack --yes.` },
		);
	}

	const confirmed = await ctx.ui.confirm("Run gt submit/update?", details);
	if (!confirmed) {
		fail("Cancelled before merge; no PRs were landed.", { level: "info" });
	}

	setStatus(ctx, `submitting ${plan.stack.current}...`);
	const result = await exec(pi, "gt", submitArgs, plan.repoRoot, GT_MUTATION_TIMEOUT_MS);
	if (result.code !== 0) {
		fail("gt submit/update failed before any PRs were landed.", {
			commandDisplay: formatCommand("gt", submitArgs),
			result,
			suggestedAction: `Resolve the submit failure, run ${formatCommand("gt", submitArgs)} manually if appropriate, then rerun /land-stack.`,
		});
	}
}

function submitUpdateArgs(branch: string): string[] {
	return ["submit", "--branch", branch, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"];
}

function formatSubmitUpdateDetails(plan: LandingPlan): string {
	const submitArgs = submitUpdateArgs(plan.stack.current);
	return [
		"GitHub PR metadata is behind local Graphite refs. Run Graphite submit/update before merging?",
		"",
		...plan.prSubmitRequirements.map(formatPrSubmitRequirement),
		"",
		`$ ${formatCommand("gt", submitArgs)}`,
	].join("\n");
}

function formatRemainingSubmitRequirements(requirements: PrSubmitRequirement[]): string {
	return [
		"gt submit/update completed, but GitHub PR metadata still differs from local Graphite refs.",
		"No PRs were landed.",
		"",
		...requirements.map(formatPrSubmitRequirement),
	].join("\n");
}

function formatPrSubmitRequirement(requirement: PrSubmitRequirement): string {
	return `- #${requirement.prNumber} ${requirement.branch}: ${requirement.reasons.join("; ")}`;
}

async function confirmAndFreeManagedSlots(pi: ExtensionAPI, ctx: ExtensionCommandContext, plan: LandingPlan): Promise<void> {
	const details = [
		"Run slot gt free-stack? This detaches/frees managed slots for stack branches.",
		"",
		...plan.managedSlotConflicts.map((conflict) => `- ${formatSlotConflict(conflict)}`),
	].join("\n");

	if (!ctx.hasUI) {
		fail(
			[
				"Managed slot worktrees block stack restack/ref updates, but this context cannot ask for the required slot cleanup confirmation.",
				details,
				"No PRs were landed. Run `slot gt free-stack` manually if appropriate, then rerun /land-stack --yes.",
			].join("\n"),
		);
	}

	const confirmed = await ctx.ui.confirm("Run slot gt free-stack?", details);
	if (!confirmed) {
		fail("Cancelled before merge; no PRs were landed.", { level: "info" });
	}

	setStatus(ctx, "freeing slots...");
	const result = await exec(pi, "slot", ["gt", "free-stack"], plan.repoRoot, SLOT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail("slot gt free-stack failed before any PRs were landed.", {
			commandDisplay: formatCommand("slot", ["gt", "free-stack"]),
			result,
			suggestedAction: "Inspect the slot state, free or detach blocking worktrees manually, then rerun /land-stack.",
		});
	}

	setStatus(ctx, "rechecking worktrees...");
	await assertCleanRepo(pi, plan.repoRoot);
	const relevantBranches = unique([...plan.stack.landingBranches, ...plan.stack.descendantBranches]);
	const conflicts = await detectWorktreeConflicts(pi, plan.repoRoot, plan.stack.current, relevantBranches);
	const remaining = conflicts.filter((conflict) => conflict.kind !== "current");
	if (remaining.length > 0) {
		fail(
			[
				"slot gt free-stack completed, but relevant branches are still checked out in other worktrees.",
				...remaining.map((conflict) => `- ${formatConflict(conflict)}`),
				"No PRs were landed.",
			].join("\n"),
			{ suggestedAction: "Resolve the remaining worktree checkouts manually, then rerun /land-stack." },
		);
	}
}

async function runMergeLoop(pi: ExtensionAPI, ctx: ExtensionCommandContext, plan: LandingPlan, landed: LandedPr[]): Promise<void> {
	const { repoRoot, stack } = plan;

	for (let index = 0; index < stack.landingBranches.length; index += 1) {
		const branch = stack.landingBranches[index] ?? "";
		const nextLandingBranch = stack.landingBranches[index + 1];
		const nextRestackBranch = nextLandingBranch ?? (index === stack.landingBranches.length - 1 ? stack.descendantBranches[0] : undefined);

		const localSha = await loadLocalSha(pi, repoRoot, branch);
		const pr = await loadPr(pi, repoRoot, branch);
		validateStrictMergeGate({ branch, localSha, pr, trunk: stack.trunk });

		setStatus(ctx, `merging #${pr.number} ${branch}...`);
		const mergeArgs = ["pr", "merge", String(pr.number), "--squash", "--match-head-commit", pr.headRefOid];
		const merge = await exec(pi, "gh", mergeArgs, repoRoot, GH_MERGE_TIMEOUT_MS);
		if (merge.code !== 0) {
			fail("Merge rejected; stopping stack landing immediately.", {
				commandDisplay: formatCommand("gh", mergeArgs),
				result: merge,
				failedBranch: branch,
				failedPr: pr.number,
				suggestedAction: `Inspect PR #${pr.number}, resolve the merge rejection, then rerun /land-stack from the desired branch.`,
			});
		}

		setStatus(ctx, `verifying #${pr.number}...`);
		let verified: PullRequestSnapshot;
		try {
			verified = await loadPr(pi, repoRoot, String(pr.number));
		} catch (error) {
			fail(`gh pr merge exited 0, but verification could not load PR #${pr.number}; local Graphite cleanup skipped.\n${errorMessage(error)}`, {
				failedBranch: branch,
				failedPr: pr.number,
				suggestedAction: `Inspect PR #${pr.number} on GitHub before deleting or restacking local Graphite branches.`,
			});
		}
		if (verified.state !== "MERGED" || !verified.mergedAt || verified.baseRefName !== stack.trunk || verified.headRefName !== branch) {
			fail("gh pr merge exited 0 but PR did not verify as MERGED; local Graphite cleanup skipped.", {
				failedBranch: branch,
				failedPr: pr.number,
				suggestedAction: `Inspect PR #${pr.number} on GitHub before deleting or restacking local Graphite branches.`,
			});
		}

		landed.push({ branch, number: pr.number, title: pr.title });

		if (nextRestackBranch) {
			setStatus(ctx, `refreshing stack through ${nextRestackBranch}...`);
			const getArgs = ["get", nextRestackBranch, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"];
			const got = await exec(pi, "gt", getArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
			if (got.code !== 0) {
				fail(`PR #${pr.number} merged, but targeted Graphite refresh failed.`, {
					commandDisplay: formatCommand("gt", getArgs),
					result: got,
					failedBranch: branch,
					failedPr: pr.number,
					suggestedAction: `Run ${formatCommand("gt", getArgs)} manually, inspect the stack, and rerun /land-stack if appropriate.`,
				});
			}
		}

		setStatus(ctx, `deleting local Graphite branch ${branch}...`);
		const deleteArgs = ["delete", branch, "-f", "-q"];
		const deleted = await exec(pi, "gt", deleteArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
		if (deleted.code !== 0) {
			fail(`PR #${pr.number} merged, but deleting the local Graphite branch ${branch} failed.`, {
				commandDisplay: formatCommand("gt", deleteArgs),
				result: deleted,
				failedBranch: branch,
				failedPr: pr.number,
				suggestedAction: `Delete or repair local Graphite branch ${branch} manually, then inspect the stack before rerunning /land-stack.`,
			});
		}

		if (nextRestackBranch) {
			setStatus(ctx, `restacking ${nextRestackBranch}...`);
			const restackArgs = ["restack", "--branch", nextRestackBranch, "--upstack", "--no-interactive"];
			const restacked = await exec(pi, "gt", restackArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
			if (restacked.code !== 0) {
				fail(formatRestackFailureMessage(pr.number, nextRestackBranch, Boolean(nextLandingBranch)), {
					commandDisplay: formatCommand("gt", restackArgs),
					result: restacked,
					failedBranch: nextRestackBranch,
					suggestedAction: `Resolve restack failures for ${nextRestackBranch}, run gt submit/update, then rerun /land-stack if appropriate.`,
				});
			}

			setStatus(ctx, `submitting ${nextRestackBranch}...`);
			const submitArgs = ["submit", "--branch", nextRestackBranch, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"];
			const submitted = await exec(pi, "gt", submitArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
			if (submitted.code !== 0) {
				fail(formatSubmitFailureMessage(pr.number, nextRestackBranch, Boolean(nextLandingBranch)), {
					commandDisplay: formatCommand("gt", submitArgs),
					result: submitted,
					failedBranch: nextRestackBranch,
					suggestedAction: `Update PR for ${nextRestackBranch} manually, verify it targets ${stack.trunk}, then rerun /land-stack if appropriate.`,
				});
			}
		}
	}
}

async function loadRepoRoot(pi: ExtensionAPI, cwd: string): Promise<string> {
	const result = await exec(pi, "git", ["rev-parse", "--show-toplevel"], cwd, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail(`Not inside a git repository.\n${formatCommandDetails(result, formatCommand("git", ["rev-parse", "--show-toplevel"]))}`);
	}
	const root = result.stdout.trim();
	if (!root) {
		fail("git rev-parse --show-toplevel returned no repository root.");
	}
	return root;
}

async function loadCurrentBranch(pi: ExtensionAPI, repoRoot: string): Promise<string> {
	const result = await exec(pi, "git", ["symbolic-ref", "--short", "HEAD"], repoRoot, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail(`Detached HEAD; check out a branch before running /${COMMAND_NAME}.\n${formatCommandDetails(result, formatCommand("git", ["symbolic-ref", "--short", "HEAD"]))}`);
	}
	const branch = result.stdout.trim();
	if (!branch) {
		fail(`Could not resolve current branch before running /${COMMAND_NAME}.`);
	}
	return branch;
}

async function loadTrunk(pi: ExtensionAPI, repoRoot: string): Promise<string> {
	const result = await exec(pi, "gt", ["trunk", "--no-interactive"], repoRoot, GT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail(`Could not resolve Graphite trunk.\n${formatCommandDetails(result, formatCommand("gt", ["trunk", "--no-interactive"]))}`);
	}
	const trunk = firstNonEmptyLine(result.stdout);
	if (!trunk) {
		fail("gt trunk --no-interactive returned no branch.");
	}
	return trunk;
}

async function loadStackSnapshot(pi: ExtensionAPI, repoRoot: string, current: string, trunk: string): Promise<StackSnapshot> {
	const args = ["log", "short", "--stack", "-r", "--no-interactive"];
	const result = await exec(pi, "gt", args, repoRoot, GT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail(`Could not load Graphite stack.\n${formatCommandDetails(result, formatCommand("gt", args))}`);
	}

	const parsed = parseGtStackOutput(result.stdout);
	if (!parsed) {
		fail("gt log short --stack returned no current-branch marker; refusing to infer the stack from git history.");
	}
	if (parsed.current !== current) {
		fail(`Graphite stack current marker is ${parsed.current}, but git current branch is ${current}; refusing to continue.`);
	}

	const warnings = [...parsed.warnings];
	if (parsed.trunk !== trunk) {
		warnings.push(`gt log stack root is ${parsed.trunk}, but gt trunk is ${trunk}; ${trunk} remains the required merge target`);
	}

	const landingBranches = unique([...parsed.ancestors.filter((branch) => branch !== trunk), current].filter((branch) => branch !== trunk));
	const descendantBranches = unique(parsed.descendants.filter((branch) => branch !== current && branch !== trunk));

	return {
		trunk,
		current,
		landingBranches,
		descendantBranches,
		warnings,
	};
}

export function parseGtStackOutput(stdout: string): ParsedStackOutput | undefined {
	const rawLines = stdout.split("\n").filter((line) => line.trim().length > 0);
	const entries: Array<{ lineIndex: number; col: number; marker: string; branch: string }> = [];

	for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
		const line = rawLines[lineIndex] ?? "";
		const position = markerPosition(line);
		if (!position) continue;
		const branch = branchNameFromLine(line, position.col);
		if (!branch) continue;
		entries.push({ lineIndex, col: position.col, marker: position.marker, branch });
	}

	const currentEntries = entries.filter((entry) => entry.marker === CURRENT_MARKER);
	if (currentEntries.length === 0) {
		return undefined;
	}

	const current = currentEntries[0];
	if (!current) return undefined;
	const warnings: string[] = [];
	if (currentEntries.length > 1) {
		warnings.push("multiple current markers found in gt log output");
	}

	const offColumn = entries.filter((entry) => entry.col !== current.col).length;
	if (offColumn > 0) {
		warnings.push(
			`${offColumn} branch(es) in gt log output sit outside the current branch's column and were not included in the stack walk`,
		);
	}

	const aligned = entries.filter((entry) => entry.col === current.col);
	const ancestors = aligned.filter((entry) => entry.lineIndex < current.lineIndex).map((entry) => entry.branch);
	const descendants = aligned.filter((entry) => entry.lineIndex > current.lineIndex).map((entry) => entry.branch);
	const trunk = ancestors[0] ?? current.branch;

	return {
		trunk,
		current: current.branch,
		ancestors,
		descendants,
		warnings,
	};
}

function markerPosition(line: string): { col: number; marker: string } | undefined {
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (char === CURRENT_MARKER || char === OTHER_MARKER) {
			return { col: index, marker: char };
		}
	}
	return undefined;
}

function branchNameFromLine(line: string, markerIndex: number): string {
	const tail = line.slice(markerIndex + 1).trimStart();
	const annotationIndex = tail.indexOf(" (");
	return (annotationIndex === -1 ? tail : tail.slice(0, annotationIndex)).trim();
}

async function assertCleanRepo(pi: ExtensionAPI, repoRoot: string): Promise<void> {
	const status = await exec(pi, "git", ["status", "--porcelain=v1"], repoRoot, GIT_TIMEOUT_MS);
	if (status.code !== 0) {
		fail(`Could not inspect working tree status.\n${formatCommandDetails(status, formatCommand("git", ["status", "--porcelain=v1"]))}`);
	}
	if (status.stdout.trim().length > 0) {
		fail("Working tree is dirty; refusing to start stack landing.");
	}

	const operation = await detectInProgressOperation(pi, repoRoot);
	if (operation) {
		fail(`${operation} is in progress; refusing to start stack landing.`);
	}
}

async function detectInProgressOperation(pi: ExtensionAPI, repoRoot: string): Promise<string | undefined> {
	const refs: Array<{ ref: string; label: string }> = [
		{ ref: "MERGE_HEAD", label: "A merge" },
		{ ref: "CHERRY_PICK_HEAD", label: "A cherry-pick" },
		{ ref: "REVERT_HEAD", label: "A revert" },
	];

	for (const { ref, label } of refs) {
		const result = await exec(pi, "git", ["rev-parse", "-q", "--verify", ref], repoRoot, GIT_TIMEOUT_MS);
		if (result.code === 0) {
			return label;
		}
	}

	// REBASE_HEAD can be left behind as a stale pseudo-ref after Git reports a
	// clean, normal worktree. Treat only Git's active rebase state directories as
	// authoritative for rebase detection.
	for (const dir of ["rebase-merge", "rebase-apply"]) {
		const pathResult = await exec(pi, "git", ["rev-parse", "--git-path", dir], repoRoot, GIT_TIMEOUT_MS);
		if (pathResult.code !== 0) continue;
		const gitPath = pathResult.stdout.trim();
		if (gitPath && existsSync(resolveGitPath(repoRoot, gitPath))) {
			return "A rebase";
		}
	}

	return undefined;
}

function resolveGitPath(repoRoot: string, gitPath: string): string {
	return isAbsolute(gitPath) ? gitPath : resolve(repoRoot, gitPath);
}

async function assertLocalBranchExists(pi: ExtensionAPI, repoRoot: string, branch: string): Promise<void> {
	const result = await exec(pi, "git", ["show-ref", "--verify", `refs/heads/${branch}`], repoRoot, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail(`Local branch ${branch} does not exist; refusing to start stack landing.\n${formatCommandDetails(result)}`);
	}
}

async function loadLocalSha(pi: ExtensionAPI, repoRoot: string, branch: string): Promise<string> {
	const ref = `refs/heads/${branch}^{commit}`;
	const result = await exec(pi, "git", ["rev-parse", "--verify", ref], repoRoot, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail(`Could not resolve local branch ${branch}.\n${formatCommandDetails(result, formatCommand("git", ["rev-parse", "--verify", ref]))}`);
	}
	const sha = result.stdout.trim();
	if (!sha) {
		fail(`git rev-parse returned no SHA for ${branch}.`);
	}
	return sha;
}

async function loadPr(pi: ExtensionAPI, repoRoot: string, branchOrNumber: string): Promise<PullRequestSnapshot> {
	const args = ["pr", "view", branchOrNumber, "--json", PR_FIELDS];
	const result = await exec(pi, "gh", args, repoRoot, GH_TIMEOUT_MS);
	if (result.code !== 0) {
		fail(`Could not load GitHub PR for ${branchOrNumber}.\n${formatCommandDetails(result, formatCommand("gh", args))}`);
	}

	let raw: Partial<PullRequestSnapshot>;
	try {
		raw = JSON.parse(result.stdout) as Partial<PullRequestSnapshot>;
	} catch (error) {
		fail(`Failed to parse gh pr view output for ${branchOrNumber}: ${errorMessage(error)}.`);
	}

	if (
		typeof raw.number !== "number" ||
		typeof raw.title !== "string" ||
		typeof raw.state !== "string" ||
		typeof raw.headRefName !== "string" ||
		typeof raw.baseRefName !== "string" ||
		typeof raw.headRefOid !== "string"
	) {
		fail(`gh pr view for ${branchOrNumber} did not return required PR fields.`);
	}

	return {
		number: raw.number,
		title: raw.title,
		state: raw.state,
		isDraft: Boolean(raw.isDraft),
		headRefName: raw.headRefName,
		baseRefName: raw.baseRefName,
		headRefOid: raw.headRefOid,
		mergeStateStatus: typeof raw.mergeStateStatus === "string" ? raw.mergeStateStatus : undefined,
		url: typeof raw.url === "string" ? raw.url : undefined,
		mergedAt: typeof raw.mergedAt === "string" || raw.mergedAt === null ? raw.mergedAt : undefined,
	};
}

export function validateInitialPrPreflight(
	branchPlans: BranchPlan[],
	trunk: string,
	options: { allowSubmitRequiredState?: boolean } = {},
): void {
	for (let index = 0; index < branchPlans.length; index += 1) {
		const branchPlan = branchPlans[index];
		if (!branchPlan) continue;
		const { branch, localSha, pr } = branchPlan;
		validateOpenPrBasics({ branch, localSha, pr, allowHeadShaMismatch: Boolean(options.allowSubmitRequiredState) });
		if (index === 0 && pr.baseRefName !== trunk && !options.allowSubmitRequiredState) {
			fail(`Bottom PR #${pr.number} targets ${pr.baseRefName}, expected ${trunk}; restack/submit it first.`);
		}
	}
}

export function validateStrictMergeGate(input: { branch: string; localSha: string; pr: PullRequestSnapshot; trunk: string }): void {
	validateOpenPrBasics(input);
	if (input.pr.baseRefName !== input.trunk) {
		fail(`PR #${input.pr.number} targets ${input.pr.baseRefName}, expected ${input.trunk}; restack/submit it first.`, {
			failedBranch: input.branch,
			failedPr: input.pr.number,
			suggestedAction: `Run gt restack/submit for ${input.branch}, then rerun /land-stack.`,
		});
	}
}

function collectPrSubmitRequirements(branchPlans: BranchPlan[], trunk: string): PrSubmitRequirement[] {
	const requirements: PrSubmitRequirement[] = [];
	for (let index = 0; index < branchPlans.length; index += 1) {
		const branchPlan = branchPlans[index];
		if (!branchPlan) continue;
		const { branch, localSha, pr } = branchPlan;
		const expectedBaseRefName = index === 0 ? trunk : undefined;
		const reasons: string[] = [];
		if (pr.headRefOid !== localSha) {
			reasons.push(`head ${shortSha(pr.headRefOid)} != local ${shortSha(localSha)}`);
		}
		if (expectedBaseRefName && pr.baseRefName !== expectedBaseRefName) {
			reasons.push(`base ${pr.baseRefName} != ${expectedBaseRefName}`);
		}
		if (reasons.length > 0) {
			requirements.push({
				branch,
				prNumber: pr.number,
				localSha,
				prHeadSha: pr.headRefOid,
				baseRefName: pr.baseRefName,
				expectedBaseRefName,
				reasons,
			});
		}
	}
	return requirements;
}

export function validateOpenPrBasics(input: {
	branch: string;
	localSha: string;
	pr: PullRequestSnapshot;
	allowHeadShaMismatch?: boolean;
}): void {
	const { branch, localSha, pr } = input;
	if (pr.state !== "OPEN") {
		fail(`PR #${pr.number} for ${branch} is ${pr.state}, expected OPEN.`);
	}
	if (pr.isDraft) {
		fail(`PR #${pr.number} for ${branch} is a draft; mark it ready before landing.`);
	}
	if (pr.headRefName !== branch) {
		fail(`PR #${pr.number} head branch is ${pr.headRefName}, expected ${branch}.`);
	}
	if (pr.headRefOid !== localSha && !input.allowHeadShaMismatch) {
		fail(
			`PR #${pr.number} head SHA does not match local branch SHA; run gt submit/update first.\nPR head: ${shortSha(pr.headRefOid)}\nLocal ${branch}: ${shortSha(localSha)}`,
		);
	}
}

async function detectWorktreeConflicts(
	pi: ExtensionAPI,
	repoRoot: string,
	currentBranch: string,
	relevantBranches: string[],
): Promise<WorktreeConflict[]> {
	const worktrees = await loadWorktrees(pi, repoRoot);
	const relevant = new Set(relevantBranches);
	const currentPath = normalizeExistingPath(repoRoot);
	const conflicts: WorktreeConflict[] = [];

	for (const worktree of worktrees) {
		if (!worktree.branch || !relevant.has(worktree.branch)) continue;
		const worktreePath = normalizeExistingPath(worktree.path);
		if (worktree.branch === currentBranch && worktreePath === currentPath) {
			conflicts.push({ branch: worktree.branch, path: worktree.path, kind: "current" });
			continue;
		}
		conflicts.push({
			branch: worktree.branch,
			path: worktree.path,
			kind: isManagedSlotPath(worktree.path) ? "managed-slot" : "manual-worktree",
		});
	}

	return conflicts;
}

async function loadWorktrees(pi: ExtensionAPI, repoRoot: string): Promise<WorktreeEntry[]> {
	const result = await exec(pi, "git", ["worktree", "list", "--porcelain"], repoRoot, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail(`Could not inspect git worktrees.\n${formatCommandDetails(result, formatCommand("git", ["worktree", "list", "--porcelain"]))}`);
	}
	return parseWorktreeList(result.stdout);
}

export function parseWorktreeList(output: string): WorktreeEntry[] {
	const entries: WorktreeEntry[] = [];
	let current: WorktreeEntry | undefined;

	const pushCurrent = () => {
		if (current?.path) {
			entries.push(current);
		}
	};

	for (const line of output.split("\n")) {
		if (line.startsWith("worktree ")) {
			pushCurrent();
			current = { path: line.slice("worktree ".length).trim() };
			continue;
		}
		if (!current) continue;
		if (line.startsWith("branch ")) {
			const ref = line.slice("branch ".length).trim();
			current.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
		}
	}
	pushCurrent();
	return entries;
}

export function isManagedSlotPath(path: string): boolean {
	const normalized = path.replaceAll("\\", "/");
	return normalized.includes("/.slots/repos/") && /\/worktrees\/slot-[^/]+(?:\/|$)/.test(normalized);
}

export function slotNameFromPath(path: string): string | undefined {
	const normalized = path.replaceAll("\\", "/");
	return normalized.match(/\/worktrees\/(slot-[^/]+)/)?.[1];
}

function normalizeExistingPath(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return resolve(path);
	}
}

export function formatPlan(plan: LandingPlan): string {
	const { stack, branchPlans, prSubmitRequirements, managedSlotConflicts } = plan;
	const lines: string[] = [];

	lines.push(`Land Graphite stack path: ${[stack.trunk, ...stack.landingBranches].join(" -> ")}`);
	lines.push("");
	lines.push(`Current branch: ${stack.current}`);
	lines.push(`Trunk branch: ${stack.trunk}`);
	lines.push("");
	lines.push("Will merge, in order:");
	branchPlans.forEach((planEntry, index) => {
		const currentLabel = planEntry.branch === stack.current ? " Current branch" : "";
		lines.push(
			`  ${index + 1}. #${planEntry.pr.number} ${planEntry.branch} ${shortSha(planEntry.localSha)} ${planEntry.pr.title}${currentLabel}`,
		);
	});

	lines.push("");
	if (stack.descendantBranches.length > 0) {
		lines.push("Will leave open/restack but not merge:");
		for (const branch of stack.descendantBranches) {
			lines.push(`  - ${branch}`);
		}
	} else {
		lines.push("No descendant PRs above the current branch will be merged.");
	}

	if (stack.warnings.length > 0) {
		lines.push("", "Warnings:");
		for (const warning of stack.warnings) {
			lines.push(`  - ${warning}`);
		}
	}

	lines.push("");
	if (prSubmitRequirements.length > 0) {
		lines.push("Before merging, this command will ask before running gt submit/update because GitHub PR metadata is behind local refs:");
		for (const requirement of prSubmitRequirements) {
			lines.push(`  ${formatPrSubmitRequirement(requirement)}`);
		}
		lines.push(`  Command: ${formatCommand("gt", submitUpdateArgs(stack.current))}`);
	} else {
		lines.push("No pre-merge PR submit/update is required.");
	}

	lines.push("");
	if (managedSlotConflicts.length > 0) {
		lines.push(
			"Before merging, this command will ask before running slot gt free-stack because these stack branches are checked out in managed slots:",
		);
		for (const conflict of managedSlotConflicts) {
			lines.push(`  - ${formatSlotConflict(conflict)}`);
		}
	} else {
		lines.push("No managed slot cleanup is required before merging.");
	}

	lines.push(
		"",
		"For each merged PR:",
		"  - gh pr merge <number> --squash --match-head-commit <sha>",
		`  - verify PR is MERGED on ${stack.trunk}`,
		"  - if another branch remains, gt get <next-branch> --downstack --no-restack --no-checkout --force --no-interactive",
		"  - gt delete <landed-branch> -f -q",
		"  - restack/submit the next branch only, if one remains",
		"",
		"Will not merge descendants above current, will not delete remote branches, will not run global gt sync --delete-all, will not wait for checks or enable auto-merge, and will stop on first failure.",
	);

	return lines.join("\n");
}

function usage(): string {
	return [
		"Usage:",
		`/${COMMAND_NAME} [--yes] [--dry-run] [--help]`,
		"",
		"Lands the current Graphite stack path from bottom branch through the current branch, one PR at a time.",
		"Requires a clean repo, non-draft open PRs, bottom PR based on gt trunk, and no manual worktree conflicts; can offer to run gt submit/update for stale PR heads before merging.",
		"",
		"Options:",
		"  --yes, -y    Skip the main landing confirmation. PR submit/update and managed slot cleanup still require explicit UI confirmation.",
		"  --dry-run    Show the plan and exit before mutating anything.",
		"  --help, -h   Show this help.",
	].join("\n");
}

function formatSuccessSummary(landed: LandedPr[], descendants: string[]): string {
	const landedText = landed.map((entry) => `#${entry.number} ${entry.branch}`).join(", ");
	const lines = [`Landed ${landed.length} PR${landed.length === 1 ? "" : "s"}: ${landedText}.`];
	if (descendants.length > 0) {
		lines.push(`Left open/restacked: ${descendants.join(", ")}.`);
	}
	lines.push("Remote branches were not deleted.");
	return lines.join("\n");
}

function formatRestackFailureMessage(previousPrNumber: number, branch: string, beforeAnotherMerge: boolean): string {
	if (beforeAnotherMerge) {
		return `Restack failed after merging #${previousPrNumber}; stopping before merging ${branch}.`;
	}
	return `Restack failed after merging #${previousPrNumber}; descendant branch ${branch} was left for manual restack/update.`;
}

function formatSubmitFailureMessage(previousPrNumber: number, branch: string, beforeAnotherMerge: boolean): string {
	if (beforeAnotherMerge) {
		return `Submit/update failed after merging #${previousPrNumber}; stopping before merging ${branch}.`;
	}
	return `Submit/update failed after merging #${previousPrNumber}; descendant branch ${branch} was left for manual PR update.`;
}

export function formatFailure(error: unknown, landed: LandedPr[]): string {
	if (!(error instanceof LandStackError)) {
		return `land-stack failed unexpectedly: ${errorMessage(error)}`;
	}

	const simple = landed.length === 0 && !error.commandDisplay && !error.failedBranch && !error.failedPr && !error.suggestedAction;
	if (simple) {
		return error.message;
	}

	const lines = ["land-stack stopped."];
	if (landed.length > 0) {
		lines.push("", "Already landed:");
		for (const entry of landed) {
			lines.push(`  - #${entry.number} ${entry.branch}`);
		}
	}
	if (error.failedBranch || error.failedPr) {
		lines.push("", `Failed at: ${formatFailedTarget(error)}`);
	}
	lines.push("", error.message);
	if (error.commandDisplay || error.result) {
		lines.push("", formatCommandDetails(error.result ?? emptyResult(), error.commandDisplay));
	}
	if (error.suggestedAction) {
		lines.push("", `Suggested next action: ${error.suggestedAction}`);
	}
	return lines.join("\n");
}

function formatFailedTarget(error: LandStackError): string {
	const parts: string[] = [];
	if (error.failedPr) parts.push(`#${error.failedPr}`);
	if (error.failedBranch) parts.push(error.failedBranch);
	return parts.join(" ") || "unknown";
}

function formatManualWorktreeConflict(conflicts: WorktreeConflict[]): string {
	if (conflicts.length === 1) {
		const conflict = conflicts[0];
		return `Branch ${conflict?.branch ?? "unknown"} is checked out in non-slot worktree ${conflict?.path ?? "unknown"}; detach it manually and rerun.`;
	}
	return [
		"Relevant branches are checked out in non-slot worktrees; detach them manually and rerun:",
		...conflicts.map((conflict) => `- ${conflict.branch} ${conflict.path}`),
	].join("\n");
}

function formatSlotConflict(conflict: WorktreeConflict): string {
	const slot = slotNameFromPath(conflict.path);
	return slot ? `${slot} ${conflict.branch} ${conflict.path}` : `${conflict.branch} ${conflict.path}`;
}

function formatConflict(conflict: WorktreeConflict): string {
	if (conflict.kind === "managed-slot") return formatSlotConflict(conflict);
	return `${conflict.branch} ${conflict.path} (${conflict.kind})`;
}

function withCommandStreaming(pi: ExtensionAPI, commandStream: LandStackCommandStream): ExtensionAPI {
	return {
		registerCommand(name, options) {
			pi.registerCommand(name, options);
		},
		async exec(command, args, options) {
			const commandDisplay = formatCommand(command, args);
			commandStream.start(commandDisplay);
			try {
				const rawResult = await pi.exec(command, args, options);
				const normalizedResult = normalizePiExecResult(rawResult);
				const finish = normalizeCommandFinish(command, args, normalizedResult);
				commandStream.finish(commandDisplay, finish);
				return finish.result;
			} catch (error) {
				const result: ExecResult = { stdout: "", stderr: errorMessage(error), code: 1, killed: false };
				commandStream.finish(commandDisplay, { result });
				throw error;
			}
		},
	};
}

function normalizePiExecResult(result: PiExecResult): ExecResult {
	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		code: result.code,
		killed: Boolean(result.killed),
	};
}

function normalizeCommandFinish(command: string, args: string[], result: ExecResult): CommandStreamFinish {
	const deleteBranch = command === "gt" && args[0] === "delete" ? args[1] : undefined;
	if (deleteBranch && result.code !== 0 && !result.killed && isGtDeleteMissingBranch(result, deleteBranch)) {
		return { result: { ...result, code: 0 }, note: `branch ${deleteBranch} already absent` };
	}
	return { result };
}

function renderCommandStreamMessage(message: CustomMessage, _options: { expanded: boolean }, theme: RenderTheme): RenderComponent {
	const content = customMessageText(message.content);
	return {
		render(width: number): string[] {
			return content.split("\n").map((line) => theme.fg(commandStreamLineColor(line), truncateDisplayLine(line, width)));
		},
		invalidate(): void {},
	};
}

function customMessageText(content: CustomMessageContent): string {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

function commandStreamLineColor(line: string): string {
	if (line.startsWith("✓")) return "success";
	if (line.startsWith("✗")) return "error";
	if (line.startsWith("→")) return "accent";
	return "dim";
}

function truncateDisplayLine(line: string, width: number): string {
	if (width <= 0) return "";
	if (line.length <= width) return line;
	if (width === 1) return "…";
	return `${line.slice(0, width - 1)}…`;
}

function formatCommandStreamBlock(icon: string, message: string): string {
	const lines = message.split("\n");
	const first = lines.shift() ?? "";
	const formatted = [first ? `${icon} ${first}` : icon];
	for (const line of lines) {
		formatted.push(line ? `  ${line}` : "");
	}
	return formatted.join("\n");
}

export function isGtDeleteMissingBranch(result: ExecResult, branch: string): boolean {
	const output = stripAnsi(`${result.stderr}\n${result.stdout}`).toLowerCase();
	return output.includes(`could not find branch ${branch.toLowerCase()}`);
}

async function exec(pi: ExtensionAPI, command: string, args: string[], cwd: string, timeout: number): Promise<ExecResult> {
	try {
		const result = normalizePiExecResult(await pi.exec(command, args, { cwd, timeout }));
		return normalizeCommandFinish(command, args, result).result;
	} catch (error) {
		return {
			stdout: "",
			stderr: errorMessage(error),
			code: 1,
			killed: false,
		};
	}
}

function commandStreamOutputLines(result: ExecResult): string[] {
	const output = outputTail(stripAnsi(`${result.stderr}\n${result.stdout}`).replace(/\r/g, "\n"));
	if (!output) return [];
	return output
		.split("\n")
		.slice(-MAX_COMMAND_STREAM_OUTPUT_LINES)
		.map((line) => `  │ ${line}`);
}

function formatCommandDetails(result: ExecResult, commandDisplay?: string): string {
	const killed = result.killed ? " (killed or timed out)" : "";
	const lines: string[] = [];
	if (commandDisplay) {
		lines.push(`$ ${commandDisplay}`);
	}
	lines.push(`exit ${result.code}${killed}`);
	lines.push(formatOutputSection("stdout", result.stdout));
	lines.push(formatOutputSection("stderr", result.stderr));
	return lines.join("\n");
}

function formatOutputSection(name: "stdout" | "stderr", output: string): string {
	const tail = outputTail(stripAnsi(output).replace(/\r/g, "\n"));
	return [`----- ${name} tail -----`, tail || "(empty)"].join("\n");
}

export function outputTail(output: string): string {
	const trimmed = output.trimEnd();
	if (!trimmed) return "";
	const lines = trimmed.split("\n");
	let tail = lines.slice(-MAX_OUTPUT_TAIL_LINES).join("\n");
	if (tail.length > MAX_OUTPUT_TAIL_CHARS) {
		tail = `…${tail.slice(-MAX_OUTPUT_TAIL_CHARS)}`;
	}
	if (lines.length > MAX_OUTPUT_TAIL_LINES) {
		return `… ${lines.length - MAX_OUTPUT_TAIL_LINES} earlier line(s) omitted\n${tail}`;
	}
	return tail;
}

export function formatCommand(command: string, args: string[]): string {
	return [command, ...args].map(shellQuoteForDisplay).join(" ");
}

function shellQuoteForDisplay(value: string): string {
	if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

function firstNonEmptyLine(output: string): string | undefined {
	return output.split("\n").map((line) => line.trim()).find(Boolean);
}

export function shortSha(sha: string): string {
	return sha.slice(0, 7);
}

function unique(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		if (!value || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
	}
	return out;
}

function present(ctx: ExtensionCommandContext, message: string, level: NotifyLevel): void {
	presentBrief(ctx, message, level, message);
}

function presentBrief(ctx: ExtensionCommandContext, fullMessage: string, level: NotifyLevel, uiMessage: string): void {
	if (ctx.hasUI) {
		ctx.ui.notify(uiMessage, level);
		return;
	}
	if (level === "error") {
		console.error(fullMessage);
		return;
	}
	console.log(fullMessage);
}

function formatSuccessNotification(message: string): string {
	return firstNonEmptyLine(message) ?? "land-stack completed.";
}

function formatFailureNotification(error: unknown): string {
	if (!(error instanceof LandStackError)) {
		return `land-stack failed unexpectedly: ${errorMessage(error)}`;
	}
	const detail = firstNonEmptyLine(error.message) ?? "unknown error";
	if (error.failedBranch || error.failedPr) {
		return `land-stack stopped at ${formatFailedTarget(error)}: ${detail}`;
	}
	if (error.level === "info") {
		return detail;
	}
	return `land-stack stopped: ${detail}`;
}

function setStatus(ctx: ExtensionCommandContext, message: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, message ? `land-stack: ${message}` : undefined);
	}
}

function fail(message: string, options?: LandStackErrorOptions): never {
	throw new LandStackError(message, options);
}

function emptyResult(): ExecResult {
	return { stdout: "", stderr: "", code: 1, killed: false };
}

export function stripAnsi(text: string): string {
	return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

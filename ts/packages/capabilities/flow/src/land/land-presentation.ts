// Flow land presentation: the single presentation surface for the `ns flow land` command face.
//
// Consolidates result-block/confirmation rendering, plan/warning/failure/success formatting,
// command-context presentation/notification helpers, and the live matrix progress controller
// that were previously split across `stack/presentation.ts`, `stack/land-presentation.ts`, and
// `land-matrix-progress.ts`.
//
// `land` reports typed settled outcomes at the Flow CLI edge. The generic finite block layout
// lives in `@nseng-ai/foundation/cli-theme` because the repeated shape was proven across Flow and
// CCC; land keeps this local facade because the Pi command-stream path must remain ANSI-free and
// domain-specific land facts stay in Flow/Land-owned code.

import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import {
	bold,
	paint,
	renderResultBlock,
	renderResultBlockFromMessage,
} from "@nseng-ai/foundation/cli-theme";
import {
	linkifyPrReferences,
	prLinksFromDetails,
	truncateDisplayLine,
} from "@nseng-ai/foundation/terminal-presentation";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import type { NsProgress } from "@nseng-ai/kernel/sdk";
import { shortSha } from "../commit-display/index.ts";
import {
	createMatrixProgressController,
	renderMatrixProgressFrame,
	rowsWithKey,
	type MatrixCellUpdate,
	type MatrixColumnSpec,
	type MatrixRowView,
} from "../phase-stream/matrix-progress-core.ts";
import { LAND_PHASES } from "../phase-stream/phase-stream-specs.ts";
import { formatCommandDetails } from "./stack/command-exec.ts";
import {
	commandStreamDetailsForLanded,
	type LandStackCommandStream,
} from "./stack/command-stream.ts";
import { COMMAND_NAME, STATUS_KEY } from "./stack/constants.ts";
import {
	emptyResult,
	failure,
	type LandStackFailure,
	type LandStackResult,
} from "./stack/errors.ts";
import { landUsageOptionRows, landUsageTokens } from "./stack/flags.ts";
import {
	formatGraphiteOperation,
	restackOperation,
	restackTargetForSubmit,
} from "./stack/graphite-command-channel.ts";
import { formatPrSubmitRequirement } from "./stack/landing-plan.ts";
import type {
	CommandStreamMessageDetails,
	LandConfirmationPreview,
	LandedPr,
	LandingWarning,
	LandResultKind,
	LandStackCommandContext,
	NotifyLevel,
	PrintAwareLandStackCommandContext,
	RemainingCleanup,
} from "./stack/types.ts";
import { formatConflict, formatSlotConflict } from "./stack/worktrees.ts";
import type { DescendantMaintenancePlan, LandingPlan } from "./types.ts";

// --------------------------------------------------------------------------
// Result blocks and confirmation rendering
// --------------------------------------------------------------------------

/**
 * The visual intent of a land outcome (canonical type in `types.ts`). Distinct from the
 * `LandStackFailure` notify level (which owns stdout/stderr routing and exit-code flipping): a
 * declined guardrail renders `refusal` (warn) even when it is notified at `error` level to flip the
 * exit code (house-style §7.3). The inventoried land states map onto these three kinds:
 *   - success: fast-path merge, stack success summary, post-landing cleanup done.
 *   - refusal: non-interactive confirmation refusal, cancelled-before-merge, base-branch mismatch,
 *     "nothing to do", post-landing cleanup declined / not-a-managed-slot.
 *   - failure: preflight load failure, merge-loop failure (incl. partial success), slot/submit
 *     pre-merge failures, post-landing free/delete failures, unexpected error.
 */
export type { LandResultKind };

export interface LandResultBlock {
	kind: LandResultKind;
	/** Leading one-line summary (already-phrased prose); rendered bold + intent-painted with a glyph. */
	headline: string;
	/**
	 * Domain-authored detail at normal weight: the plan preview, partial-success "already landed"
	 * list, failure cause + command details, or post-landing cleanup details. Built by the typed
	 * formatters in `presentation.ts`; passed through as-is so this stays a pure layout primitive.
	 */
	body?: string;
	/** Optional normal-weight "what to do next" line (e.g. a suggested recovery command). */
	guidance?: string;
	/** Optional working directory / repo root, shown as dimmed plumbing evidence when present. */
	cwd?: string;
}

export interface LandResultMessageBlock {
	kind: LandResultKind;
	/** Domain-authored message whose first line becomes the headline and rest becomes the body. */
	message: string;
	/** Optional normal-weight "what to do next" line (e.g. a suggested recovery command). */
	guidance?: string;
	/** Optional working directory / repo root, shown as dimmed plumbing evidence when present. */
	cwd?: string;
}

/** Render a land result block to a string, styled and degraded for `caps`. */
export function renderLandResultBlock(caps: Caps, input: LandResultBlock): string {
	return renderResultBlock(caps, input);
}

/** Render a domain-authored land message using the shared first-line headline grammar. */
export function renderLandResultBlockFromMessage(
	caps: Caps,
	input: LandResultMessageBlock,
): string {
	return renderResultBlockFromMessage(caps, input);
}

export function renderPlainLandConfirmationDetails(input: LandConfirmationPreview): string {
	return buildConfirmationLines(input, plainConfirmationStyle()).join("\n");
}

export function renderLandConfirmationDetails(caps: Caps, input: LandConfirmationPreview): string {
	return buildConfirmationLines(input, styledConfirmationStyle(caps)).join("\n");
}

interface ConfirmationLineStyle {
	headline(text: string): string;
	section(text: string): string;
	bulletPrefix(text: string): string;
	planLabel(text: string): string;
	guidance(text: string): string;
}

function plainConfirmationStyle(): ConfirmationLineStyle {
	return {
		headline: identity,
		section: identity,
		bulletPrefix: identity,
		planLabel: identity,
		guidance: identity,
	};
}

function styledConfirmationStyle(caps: Caps): ConfirmationLineStyle {
	return {
		headline: (text) => bold(paint(caps, "accent", text)),
		section: (text) => paint(caps, "accent", text),
		bulletPrefix: (text) => paint(caps, "accent", text),
		planLabel: (text) => paint(caps, "muted", text),
		guidance: (text) => paint(caps, "success", text),
	};
}

function identity(text: string): string {
	return text;
}

function buildConfirmationLines(
	input: LandConfirmationPreview,
	style: ConfirmationLineStyle,
): string[] {
	const labelWidth = confirmationPlanLabelWidth(input);
	return [
		style.headline(input.headline),
		"",
		style.section("Impact"),
		...input.impactLines.map((line) => `${style.bulletPrefix("  •")} ${line}`),
		"",
		style.section("Plan"),
		...input.planRows.map((row) => renderConfirmationPlanRow(row, labelWidth, style)),
		"",
		style.guidance(input.guidance),
	];
}

function confirmationPlanLabelWidth(input: LandConfirmationPreview): number {
	return input.planRows.reduce((width, row) => Math.max(width, row.label.length), 0);
}

function renderConfirmationPlanRow(
	row: LandConfirmationPreview["planRows"][number],
	labelWidth: number,
	style: ConfirmationLineStyle,
): string {
	return `${style.planLabel(`  ${row.label.padEnd(labelWidth)}`)}  ${row.value}`;
}

// --------------------------------------------------------------------------
// Plan, warning, failure, and success formatting + presentation helpers
// --------------------------------------------------------------------------

const MAX_NOTIFICATION_CHARS = 160;

export function formatPlan(plan: LandingPlan): string {
	const { stack, branchPlans, prSubmitRequirements, managedSlotConflicts } = plan;
	const lines: string[] = [];

	lines.push(`Land Graphite stack path: ${[stack.trunk, ...stack.landingBranches].join(" -> ")}`);
	lines.push("");
	lines.push(`Current branch: ${stack.actualCurrentBranch}`);
	lines.push(`Landing target branch: ${stack.landingTargetBranch}`);
	lines.push(`Trunk branch: ${stack.trunk}`);
	lines.push("");
	lines.push("Will merge, in order:");
	branchPlans.forEach((planEntry, index) => {
		const currentLabel = planEntry.branch === stack.actualCurrentBranch ? " Current branch" : "";
		const targetLabel =
			planEntry.branch === stack.landingTargetBranch &&
			planEntry.branch !== stack.actualCurrentBranch
				? " Landing target"
				: "";
		const labels = `${currentLabel}${targetLabel}`;
		lines.push(
			`  ${index + 1}. #${planEntry.pr.number} ${planEntry.branch} ${shortSha(planEntry.localSha)} ${planEntry.pr.title}${labels}`,
		);
	});

	lines.push("");
	lines.push(...formatDescendantMaintenancePlan(plan.descendantMaintenance));

	if (stack.warnings.length > 0) {
		lines.push("", "Warnings:");
		for (const warning of stack.warnings) {
			lines.push(`  - ${warning.message}`);
		}
	}

	lines.push("");
	if (managedSlotConflicts.length > 0) {
		lines.push(
			"Before merging, this command will ask before freeing these landing-branch slots only:",
		);
		for (const conflict of managedSlotConflicts) {
			lines.push(`  - ${formatSlotConflict(conflict)}`);
		}
	} else {
		lines.push("No landing-branch managed slot cleanup is required before merging.");
	}

	lines.push("");
	if (prSubmitRequirements.length > 0) {
		const restackTarget = restackTargetForSubmit(plan);
		lines.push(
			restackTarget
				? "Before merging, this command will ask before running gt restack + submit/update because local branch reachability shows restack is required and GitHub PR metadata is behind local refs:"
				: "Before merging, this command will ask before running gt submit/update because GitHub PR metadata is behind local refs:",
		);
		if (restackTarget) {
			for (const requirement of plan.submitRestackRequirements) {
				lines.push(`  Restack: ${requirement.branch} on ${requirement.parent}`);
			}
		}
		for (const requirement of prSubmitRequirements) {
			lines.push(`  ${formatPrSubmitRequirement(requirement)}`);
		}
		if (restackTarget) {
			lines.push(
				`  Command: ${formatGraphiteOperation(restackOperation({ branch: restackTarget, scope: "upstack" }))}`,
			);
		}
		lines.push(
			`  Command: ${formatGraphiteOperation({ kind: "submit-update", branch: stack.landingTargetBranch })}`,
		);
	} else {
		lines.push("No pre-merge PR submit/update is required.");
	}

	lines.push(
		"",
		"For each merged PR:",
		"  - gh pr merge <number> --squash --match-head-commit <headRefOid> --subject <PR title> --body <PR body>",
		`  - verify PR is MERGED on ${stack.trunk}`,
		"  - if another landing branch remains, gt get <next-branch> --downstack --no-restack --no-checkout --force --no-interactive",
		"  - gt delete <landed-branch> -f -q, retaining the final landed local branch when it is checked out in this worktree",
		"  - restack/submit the next landing branch when required; descendant restack/update is optional after target PRs land",
		"",
		"Will not merge descendants above current, will not delete remote branches, will not run global gt sync --delete-all, will not wait for checks or enable auto-merge, and will stop on first failure before all target PRs land.",
	);

	return lines.join("\n");
}

function formatDescendantMaintenancePlan(maintenance: DescendantMaintenancePlan): string[] {
	if (maintenance.type === "none") {
		return ["No descendant PRs above the current branch will be merged."];
	}

	if (maintenance.type === "auto") {
		return [
			"Will leave open and try to restack/update after target PRs land:",
			...maintenance.branches.map((branch) => `  - ${branch}`),
		];
	}

	return [
		"Will leave open without automatic restack/update because these descendants are checked out elsewhere:",
		...maintenance.conflicts.map((conflict) => `  - ${formatConflict(conflict)}`),
	];
}

export function usage(): string {
	return [
		"Usage:",
		`/${COMMAND_NAME} ${landUsageTokens().join(" ")}`,
		"",
		"Lands the current PR or Graphite stack into gt trunk.",
		"Fast path requires Graphite to prove an isolated single-PR stack. Stack path lands bottom branch through current branch, one PR at a time, and maintains descendants when possible.",
		"Stack mode requires a clean repo, non-draft open PRs, bottom PR based on gt trunk, and no landing-branch manual worktree conflicts; descendant worktree conflicts skip optional post-landing restack/update.",
		"After successful landing, this command frees the current managed slot and deletes the landed local branch by default; use --preserve to keep them.",
		"",
		"Options:",
		...landUsageOptionRows().map(formatUsageOptionRow),
	].join("\n");
}

function formatUsageOptionRow(row: { aliases: readonly string[]; description: string }): string {
	return `  ${row.aliases.join(", ").padEnd(15, " ")} ${row.description}`;
}

export function formatSuccessSummary(
	landed: LandedPr[],
	descendantMaintenance: DescendantMaintenancePlan,
	warnings: LandingWarning[],
	cleanup: RemainingCleanup,
): string {
	const warningEntries = warnings.filter((warning) => landingWarningLevel(warning) === "warning");
	const noteEntries = warnings.filter((warning) => landingWarningLevel(warning) === "info");
	const landedText = landed.map((entry) => `#${entry.number} ${entry.branch}`).join(", ");
	const lines = [`Landed ${landed.length} PR${landed.length === 1 ? "" : "s"}: ${landedText}.`];
	if (descendantMaintenance.type === "auto" && descendantMaintenance.branches.length > 0) {
		if (hasDescendantMaintenanceDeferral(noteEntries)) {
			lines.push(
				`Left open; restack/update deferred: ${descendantMaintenance.branches.join(", ")}.`,
			);
		} else if (hasDescendantMaintenanceWarning(warningEntries)) {
			lines.push(
				`Left open; restack/update needs follow-up: ${descendantMaintenance.branches.join(", ")}.`,
			);
		} else {
			lines.push(`Left open/restacked: ${descendantMaintenance.branches.join(", ")}.`);
		}
	} else if (descendantMaintenance.type === "skipped") {
		lines.push(`Left open; restack/update skipped: ${descendantMaintenance.branches.join(", ")}.`);
		lines.push(`Reason: ${descendantMaintenance.reason}.`);
	}
	lines.push("", "Remaining cleanup:");
	lines.push("  - Remote branches were not deleted.");
	for (const retained of cleanup.retainedLocalBranches) {
		lines.push(
			`  - Local branch ${retained.branch} was kept (still checked out at ${retained.path}); delete it manually or run gt sync.`,
		);
	}
	if (cleanup.retainedLocalBranches.length === 0) {
		lines.push(
			"  - Clean up any remaining local branches manually, for example by running `gt sync` or deleting branches directly.",
		);
	}
	if (warningEntries.length > 0) {
		lines.push(
			"",
			`Completed with ${warningEntries.length} warning${warningEntries.length === 1 ? "" : "s"}:`,
		);
		for (const warning of warningEntries) {
			lines.push(...formatLandingWarning(warning));
		}
	}
	if (noteEntries.length > 0) {
		lines.push("", "Notes:");
		for (const note of noteEntries) {
			lines.push(...formatLandingWarning(note));
		}
	}
	return lines.join("\n");
}

function landingWarningLevel(warning: LandingWarning): "warning" | "info" {
	return warning.level ?? "warning";
}

function hasDescendantMaintenanceWarning(warnings: LandingWarning[]): boolean {
	return warnings.some((warning) => warning.message.toLowerCase().includes("descendant"));
}

function hasDescendantMaintenanceDeferral(warnings: LandingWarning[]): boolean {
	return warnings.some((warning) => {
		const message = warning.message.toLowerCase();
		return message.includes("descendant") && message.includes("deferred");
	});
}

export function formatLandingWarning(warning: LandingWarning): string[] {
	const lines = [`- ${warning.message}`];
	if (warning.commandDisplay || warning.result) {
		lines.push(
			...indentLines(
				formatCommandDetails(warning.result ?? emptyResult(), warning.commandDisplay),
				"  ",
			),
		);
	}
	if (warning.suggestedAction) {
		lines.push(`  Suggested next action: ${warning.suggestedAction}`);
	}
	return lines;
}

export function indentLines(text: string, prefix: string): string[] {
	return text.split("\n").map((line) => `${prefix}${line}`);
}

export function formatRestackFailureMessage(
	previousPrNumber: number,
	branch: string,
	beforeAnotherMerge: boolean,
): string {
	if (beforeAnotherMerge) {
		return `Restack failed after merging #${previousPrNumber}; stopping before merging ${branch}.`;
	}
	return `Restack failed after merging #${previousPrNumber}; descendant branch ${branch} was left for manual restack/update.`;
}

export function formatSubmitFailureMessage(
	previousPrNumber: number,
	branch: string,
	beforeAnotherMerge: boolean,
): string {
	if (beforeAnotherMerge) {
		return `Submit/update failed after merging #${previousPrNumber}; stopping before merging ${branch}.`;
	}
	return `Submit/update failed after merging #${previousPrNumber}; descendant branch ${branch} was left for manual PR update.`;
}

export function formatFailure(failure: LandStackFailure, landed: readonly LandedPr[]): string {
	const simple =
		landed.length === 0 &&
		!failure.commandDisplay &&
		!failure.failedBranch &&
		!failure.failedPr &&
		!failure.suggestedAction;
	if (simple) {
		return failure.message;
	}

	const lines = ["land stopped."];
	if (landed.length > 0) {
		lines.push("", "Already landed:");
		for (const entry of landed) {
			lines.push(`  - #${entry.number} ${entry.branch}`);
		}
	}
	if (failure.failedBranch || failure.failedPr) {
		lines.push("", `Failed at: ${formatFailedTarget(failure)}`);
	}
	lines.push("", failure.message);
	if (failure.commandDisplay || failure.result) {
		lines.push("", formatCommandDetails(failure.result ?? emptyResult(), failure.commandDisplay));
	}
	if (failure.suggestedAction) {
		lines.push("", `Suggested next action: ${failure.suggestedAction}`);
	}
	return lines.join("\n");
}

export function formatFailedTarget(failure: LandStackFailure): string {
	const parts: string[] = [];
	if (failure.failedPr) parts.push(`#${failure.failedPr}`);
	if (failure.failedBranch) parts.push(failure.failedBranch);
	return parts.join(" ") || "unknown";
}

export interface FormatSuccessNotificationOptions {
	details?: CommandStreamMessageDetails;
	warnings?: readonly LandingWarning[];
}

export function formatSuccessNotification(
	message: string,
	options: FormatSuccessNotificationOptions = {},
): string {
	const { details, warnings = [] } = options;
	const warningNotification = formatWarningSuccessNotification(warnings, details);
	if (warningNotification !== undefined) return warningNotification;

	const firstLine = firstNonEmptyLine(message) ?? "land completed.";
	return details ? linkifyPrReferences(firstLine, prLinksFromDetails(details)) : firstLine;
}

function formatWarningSuccessNotification(
	warnings: readonly LandingWarning[],
	details?: CommandStreamMessageDetails,
): string | undefined {
	const warningEntries = warnings.filter((warning) => landingWarningLevel(warning) === "warning");
	const action = firstWarningAction(warningEntries);
	if (action === undefined) return undefined;

	const compact = truncateDisplayLine(singleLine(action), MAX_NOTIFICATION_CHARS);
	return details ? linkifyPrReferences(compact, prLinksFromDetails(details)) : compact;
}

function firstWarningAction(warnings: readonly LandingWarning[]): string | undefined {
	for (const warning of warnings) {
		const action = nonBlank(warning.notificationAction) ?? nonBlank(warning.suggestedAction);
		if (action !== undefined) return action;
	}
	return nonBlank(warnings[0]?.message);
}

function singleLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function nonBlank(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function formatFailureNotification(failure: LandStackFailure): string {
	const detail = firstNonEmptyLine(failure.message) ?? "unknown error";
	if (failure.failedBranch || failure.failedPr) {
		return `land stopped at ${formatFailedTarget(failure)}: ${detail}`;
	}
	if (failure.level === "info") {
		return detail;
	}
	return `land stopped: ${detail}`;
}

export function presentFailureAndReturn(
	ctx: PrintAwareLandStackCommandContext,
	landFailure: LandStackFailure,
): LandStackResult<never> {
	presentBrief({
		ctx,
		fullMessage: formatFailure(landFailure, []),
		level: landFailure.level,
		uiMessage: formatFailureNotification(landFailure),
		kind: landFailureKind(landFailure),
	});
	return failure(landFailure);
}

/**
 * Map a typed failure onto its house-style visual intent (§7.3). A declined guardrail renders warn
 * (`refusal`); a real subprocess/preflight error renders red (`failure`). The notify level is left
 * untouched so stdout/stderr routing and exit codes are preserved.
 */
export function landFailureKind(failure: LandStackFailure): LandResultKind {
	return failure.outcome === "refusal" ? "refusal" : "failure";
}

interface PresentOptions {
	ctx: LandStackCommandContext;
	message: string;
	level: NotifyLevel;
	kind?: LandResultKind;
}

export function present(options: PresentOptions): void {
	presentBrief({
		ctx: options.ctx,
		fullMessage: options.message,
		level: options.level,
		uiMessage: options.message,
		...(options.kind === undefined ? {} : { kind: options.kind }),
	});
}

interface PresentDryRunLandingOptions {
	ctx: LandStackCommandContext;
	commandStream: LandStackCommandStream;
	planText: string;
}

export function presentDryRunLanding(options: PresentDryRunLandingOptions): void {
	const message = "Dry run only; no PRs or local refs were changed.";
	options.commandStream.finishSuccess(message);
	present({
		ctx: options.ctx,
		message: `${message}\n\n${options.planText}`,
		level: "info",
		kind: "success",
	});
}

interface PresentBriefOptions {
	ctx: LandStackCommandContext;
	fullMessage: string;
	level: NotifyLevel;
	uiMessage: string;
	kind?: LandResultKind;
}

export function presentBrief(options: PresentBriefOptions): void {
	const { ctx, fullMessage, level, uiMessage } = options;
	const shown = ctx.hasUI ? uiMessage : fullMessage;
	// House-style ANSI is applied only when the CLI edge wired `renderResultBlock`; the Pi
	// command-stream context leaves it undefined, so the shared notify text stays plain there.
	const rendered =
		options.kind !== undefined && ctx.renderResultBlock !== undefined
			? ctx.renderResultBlock(options.kind, shown)
			: shown;
	ctx.ui.notify(rendered, level);
}

interface PresentPrintAwareBriefOptions {
	ctx: PrintAwareLandStackCommandContext;
	fullMessage: string;
	level: NotifyLevel;
	uiMessage?: string;
	kind?: LandResultKind;
}

export function presentPrintAwareBrief(options: PresentPrintAwareBriefOptions): void {
	if (options.ctx.mode === "print") {
		const output = options.fullMessage.endsWith("\n")
			? options.fullMessage
			: `${options.fullMessage}\n`;
		(options.ctx.printOutput ?? process.stdout).write(output);
	}
	presentBrief({
		ctx: options.ctx,
		fullMessage: options.fullMessage,
		level: options.level,
		uiMessage: options.uiMessage ?? options.fullMessage,
		...(options.kind === undefined ? {} : { kind: options.kind }),
	});
}

interface NotifyPrintAwareOptions {
	ctx: PrintAwareLandStackCommandContext;
	message: string;
	level: NotifyLevel;
	kind?: LandResultKind;
}

export function notifyPrintAware(options: NotifyPrintAwareOptions): void {
	presentPrintAwareBrief({
		ctx: options.ctx,
		fullMessage: options.message,
		level: options.level,
		...(options.kind === undefined ? {} : { kind: options.kind }),
	});
}

interface PresentLandingSuccessOptions {
	ctx: LandStackCommandContext;
	commandStream: LandStackCommandStream;
	landed: readonly LandedPr[];
	warnings: readonly LandingWarning[];
	successSummary: string;
}

export function presentLandingSuccess(options: PresentLandingSuccessOptions): void {
	const commandStreamDetails = commandStreamDetailsForLanded([...options.landed]);
	const completionLevel = options.warnings.some(
		(warning) => (warning.level ?? "warning") === "warning",
	)
		? "warning"
		: "success";
	options.commandStream.finishSuccess(options.successSummary, commandStreamDetails);
	presentBrief({
		ctx: options.ctx,
		fullMessage: options.successSummary,
		level: completionLevel,
		uiMessage: formatSuccessNotification(options.successSummary, {
			...(commandStreamDetails === undefined ? {} : { details: commandStreamDetails }),
			warnings: options.warnings,
		}),
		kind: "success",
	});
}

export function setStatus(ctx: LandStackCommandContext, message: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, message ? `land: ${message}` : undefined);
	}
}

// --------------------------------------------------------------------------
// Live matrix progress
// --------------------------------------------------------------------------

export type LandMatrixColumnKey = "gate" | "merge" | "verify" | "restack";

export interface LandMatrixRowSpec {
	branch: string;
	prNumber: number;
	label: string;
}

export interface LandMatrixProgressSink {
	setRows(rows: readonly LandMatrixRowSpec[]): void;
	setRunningCommands(commands: readonly string[]): void;
	setCell(branch: string, column: LandMatrixColumnKey, update: MatrixCellUpdate): void;
	setAllCells(column: LandMatrixColumnKey, update: MatrixCellUpdate): void;
	setAllOtherCells(column: LandMatrixColumnKey, branch: string, update: MatrixCellUpdate): void;
	recordMergedPr(prNumber: number): void;
}

export interface LandMatrixProgressController extends LandMatrixProgressSink {
	begin(): void;
	setTitle(title: string): void;
	note(text: string): void;
	finish(options?: { isFailed?: boolean; finalLines?: readonly string[] }): Promise<void>;
	stop(): Promise<void>;
}

export interface LandLiveProgressState {
	totalPrs?: number;
	landedPrs: number;
}

export const BASE_LAND_TITLE = "ns flow land";

export const LAND_MATRIX_COLUMNS: readonly MatrixColumnSpec<LandMatrixColumnKey>[] = [
	{ key: "gate", label: "Gate", width: 5 },
	{ key: "merge", label: "Merge", width: 6 },
	{ key: "verify", label: "Verify", width: 6 },
	{ key: "restack", label: "Restack", width: 7 },
];

export function formatLandProgressTitle(state: LandLiveProgressState): string {
	if (state.totalPrs !== undefined) {
		return `${BASE_LAND_TITLE} — ${state.landedPrs}/${state.totalPrs} target PRs merged`;
	}
	if (state.landedPrs > 0) {
		return `${BASE_LAND_TITLE} — ${state.landedPrs} target PR${state.landedPrs === 1 ? "" : "s"} merged`;
	}
	return BASE_LAND_TITLE;
}

export function landMatrixRowsFromPlan(
	plan: Pick<LandingPlan, "branchPlans" | "stack">,
): readonly LandMatrixRowSpec[] {
	return plan.stack.landingBranches.map((branch) => {
		const branchPlan = plan.branchPlans.find((item) => item.branch === branch);
		const prNumber = branchPlan?.pr.number ?? 0;
		return {
			branch,
			prNumber,
			label: prNumber === 0 ? branch : `${branch} (#${prNumber})`,
		};
	});
}

export function createLandMatrixProgressController(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	forward?: NsProgress;
}): LandMatrixProgressController {
	const liveState: LandLiveProgressState = { landedPrs: 0 };
	const landedPrNumbers = new Set<number>();
	const controller = createMatrixProgressController({
		caps: options.caps,
		deps: options.deps,
		title: formatLandProgressTitle(liveState),
		rows: [],
		columns: LAND_MATRIX_COLUMNS,
		globalRows: [],
		phases: LAND_PHASES,
		...(options.forward === undefined ? {} : { forward: options.forward }),
		begin: "lazy",
	});

	function setRows(rows: readonly LandMatrixRowSpec[]): void {
		liveState.totalPrs = rows.length;
		controller.setTitle(formatLandProgressTitle(liveState));
		controller.setRows(rowsWithKey(rows, (row) => row.branch));
	}

	function recordMergedPr(prNumber: number): void {
		if (landedPrNumbers.has(prNumber)) return;
		landedPrNumbers.add(prNumber);
		liveState.landedPrs += 1;
		controller.setTitle(formatLandProgressTitle(liveState));
	}

	return {
		begin: controller.begin,
		setTitle: controller.setTitle,
		setRows,
		setRunningCommands: controller.setRunningCommands,
		setCell: controller.setCell,
		setAllCells: controller.setAllCells,
		setAllOtherCells: controller.setAllOtherCells,
		recordMergedPr,
		note: controller.note,
		finish: controller.finish,
		stop: controller.stop,
	};
}

export function renderLandMatrixProgressFrame(input: {
	caps: Caps;
	title: string;
	runningCommands?: readonly string[];
	rows: readonly (LandMatrixRowSpec & MatrixRowView<LandMatrixColumnKey>)[];
	tailLine?: string;
	tick?: number;
}): readonly string[] {
	return renderMatrixProgressFrame({
		caps: input.caps,
		title: input.title,
		columns: LAND_MATRIX_COLUMNS,
		...(input.runningCommands === undefined ? {} : { runningCommands: input.runningCommands }),
		globals: [],
		rows: input.rows,
		...(input.tailLine === undefined ? {} : { tailLine: input.tailLine }),
		...(input.tick === undefined ? {} : { tick: input.tick }),
	});
}

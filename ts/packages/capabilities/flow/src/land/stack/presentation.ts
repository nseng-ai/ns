import {
	linkifyPrReferences,
	prLinksFromDetails,
	truncateDisplayLine,
} from "@ns/core/terminal-presentation";
import { firstNonEmptyLine } from "@ns/core/text-normalization";
import { shortSha } from "../../commit-display/index.ts";
import { commandStreamDetailsForLanded, type LandStackCommandStream } from "./command-stream.ts";
import { formatCommandDetails } from "./command-exec.ts";
import { COMMAND_NAME, STATUS_KEY } from "./constants.ts";
import { emptyResult, failure, type LandStackFailure, type LandStackOutcome } from "./errors.ts";
import { landUsageOptionRows, landUsageTokens } from "./flags.ts";
import {
	formatGraphiteOperation,
	restackOperation,
	restackTargetForSubmit,
} from "./graphite-command-channel.ts";
import { formatPrSubmitRequirement } from "./landing-plan.ts";
import type {
	CommandStreamMessageDetails,
	DescendantMaintenancePlan,
	LandStackCommandContext,
	LandedPr,
	FlowLandingPlan,
	LandingWarning,
	LandResultKind,
	NotifyLevel,
	PrintAwareLandStackCommandContext,
	RemainingCleanup,
} from "./types.ts";
import { formatConflict, formatSlotConflict } from "./worktrees.ts";

const MAX_NOTIFICATION_CHARS = 160;

export function formatPlan(plan: FlowLandingPlan): string {
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
			lines.push(`  - ${warning}`);
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
	if (maintenance.kind === "none") {
		return ["No descendant PRs above the current branch will be merged."];
	}

	if (maintenance.kind === "auto") {
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
	if (descendantMaintenance.kind === "auto" && descendantMaintenance.branches.length > 0) {
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
	} else if (descendantMaintenance.kind === "skipped") {
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

export function presentFailureOutcome(
	ctx: PrintAwareLandStackCommandContext,
	landFailure: LandStackFailure,
): LandStackOutcome {
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

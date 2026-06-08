import { formatCommand } from "@asdl/pi-extension-runtime/command-runtime";
import { linkifyPrReferences, prLinksFromDetails, truncateDisplayLine } from "@asdl/pi-extension-runtime/terminal-presentation";
import { formatCommandDetails, shortSha } from "./command-exec.ts";
import { COMMAND_NAME, STATUS_KEY } from "./constants.ts";
import { emptyResult, type LandStackFailure } from "./errors.ts";
import { restackForSubmitArgs, restackTargetForSubmit, submitUpdateArgs } from "./landing-plan.ts";
import { formatPrSubmitRequirement } from "./pr-facts.ts";
import type {
	CommandStreamMessageDetails,
	DescendantMaintenancePlan,
	LandStackCommandContext,
	LandedPr,
	LandingPlan,
	LandingWarning,
	NotifyLevel,
} from "./types.ts";
import { formatConflict, formatSlotConflict } from "./worktrees.ts";

const MAX_NOTIFICATION_CHARS = 160;

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
	lines.push(...formatDescendantMaintenancePlan(plan.descendantMaintenance));

	if (stack.warnings.length > 0) {
		lines.push("", "Warnings:");
		for (const warning of stack.warnings) {
			lines.push(`  - ${warning}`);
		}
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
			lines.push(`  Command: ${formatCommand("gt", restackForSubmitArgs(restackTarget))}`);
		}
		lines.push(`  Command: ${formatCommand("gt", submitUpdateArgs(stack.current))}`);
	} else {
		lines.push("No pre-merge PR submit/update is required.");
	}

	lines.push("");
	if (managedSlotConflicts.length > 0) {
		lines.push("Before merging, this command will ask before freeing these landing-branch slots only:");
		for (const conflict of managedSlotConflicts) {
			lines.push(`  - ${formatSlotConflict(conflict)}`);
		}
	} else {
		lines.push("No landing-branch managed slot cleanup is required before merging.");
	}

	lines.push(
		"",
		"For each merged PR:",
		"  - gh pr merge <number> --squash --match-head-commit <headRefOid> --subject <PR title> --body <PR body>",
		`  - verify PR is MERGED on ${stack.trunk}`,
		"  - if another landing branch remains, gt get <next-branch> --downstack --no-restack --no-checkout --force --no-interactive",
		"  - gt delete <landed-branch> -f -q, except when descendant maintenance is skipped to avoid collateral child restacks",
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
		`/${COMMAND_NAME} [--yes] [--dry-run] [--help]`,
		"",
		"Lands the current Graphite stack path from bottom branch through the current branch, one PR at a time.",
		"Requires a clean repo, non-draft open PRs, bottom PR based on gt trunk, and no landing-branch manual worktree conflicts; descendant worktree conflicts skip optional post-landing restack/update.",
		"",
		"Options:",
		"  --yes, -y    Skip the main landing confirmation. PR submit/update and landing-branch managed slot cleanup still require explicit UI confirmation.",
		"  --dry-run    Show the plan and exit before mutating anything.",
		"  --help, -h   Show this help.",
	].join("\n");
}

export function formatSuccessSummary(
	landed: LandedPr[],
	descendantMaintenance: DescendantMaintenancePlan,
	warnings: LandingWarning[] = [],
): string {
	const warningEntries = warnings.filter((warning) => landingWarningLevel(warning) === "warning");
	const noteEntries = warnings.filter((warning) => landingWarningLevel(warning) === "info");
	const landedText = landed.map((entry) => `#${entry.number} ${entry.branch}`).join(", ");
	const lines = [`Landed ${landed.length} PR${landed.length === 1 ? "" : "s"}: ${landedText}.`];
	if (descendantMaintenance.kind === "auto" && descendantMaintenance.branches.length > 0) {
		if (hasDescendantMaintenanceDeferral(noteEntries)) {
			lines.push(`Left open; restack/update deferred: ${descendantMaintenance.branches.join(", ")}.`);
		} else if (hasDescendantMaintenanceWarning(warningEntries)) {
			lines.push(`Left open; restack/update needs follow-up: ${descendantMaintenance.branches.join(", ")}.`);
		} else {
			lines.push(`Left open/restacked: ${descendantMaintenance.branches.join(", ")}.`);
		}
	} else if (descendantMaintenance.kind === "skipped") {
		lines.push(`Left open; restack/update skipped: ${descendantMaintenance.branches.join(", ")}.`);
		lines.push(`Reason: ${descendantMaintenance.reason}.`);
	}
	lines.push("Remote branches were not deleted.");
	lines.push("Clean up any remaining local branches manually, for example by running `gt sync` or deleting branches directly.");
	if (warningEntries.length > 0) {
		lines.push("", `Completed with ${warningEntries.length} warning${warningEntries.length === 1 ? "" : "s"}:`);
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
		lines.push(...indentLines(formatCommandDetails(warning.result ?? emptyResult(), warning.commandDisplay), "  "));
	}
	if (warning.suggestedAction) {
		lines.push(`  Suggested next action: ${warning.suggestedAction}`);
	}
	return lines;
}

export function indentLines(text: string, prefix: string): string[] {
	return text.split("\n").map((line) => `${prefix}${line}`);
}

export function formatRestackFailureMessage(previousPrNumber: number, branch: string, beforeAnotherMerge: boolean): string {
	if (beforeAnotherMerge) {
		return `Restack failed after merging #${previousPrNumber}; stopping before merging ${branch}.`;
	}
	return `Restack failed after merging #${previousPrNumber}; descendant branch ${branch} was left for manual restack/update.`;
}

export function formatSubmitFailureMessage(previousPrNumber: number, branch: string, beforeAnotherMerge: boolean): string {
	if (beforeAnotherMerge) {
		return `Submit/update failed after merging #${previousPrNumber}; stopping before merging ${branch}.`;
	}
	return `Submit/update failed after merging #${previousPrNumber}; descendant branch ${branch} was left for manual PR update.`;
}

export function formatFailure(failure: LandStackFailure, landed: readonly LandedPr[]): string {
	const simple = landed.length === 0 && !failure.commandDisplay && !failure.failedBranch && !failure.failedPr && !failure.suggestedAction;
	if (simple) {
		return failure.message;
	}

	const lines = ["land-stack stopped."];
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
	details?: CommandStreamMessageDetails | undefined;
	warnings?: readonly LandingWarning[] | undefined;
}

export function formatSuccessNotification(message: string, options: FormatSuccessNotificationOptions = {}): string {
	const { details, warnings = [] } = options;
	const warningNotification = formatWarningSuccessNotification(warnings, details);
	if (warningNotification !== undefined) return warningNotification;

	const firstLine = firstNonEmptyLine(message) ?? "land-stack completed.";
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
		return `land-stack stopped at ${formatFailedTarget(failure)}: ${detail}`;
	}
	if (failure.level === "info") {
		return detail;
	}
	return `land-stack stopped: ${detail}`;
}

export function present(ctx: LandStackCommandContext, message: string, level: NotifyLevel): void {
	presentBrief(ctx, message, level, message);
}

export function presentBrief(ctx: LandStackCommandContext, fullMessage: string, level: NotifyLevel, uiMessage: string): void {
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

export function setStatus(ctx: LandStackCommandContext, message: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, message ? `land-stack: ${message}` : undefined);
	}
}

function firstNonEmptyLine(output: string): string | undefined {
	return output.split("\n").map((line) => line.trim()).find(Boolean);
}

import { formatCommand } from "../command-runtime.ts";
import { formatCommandDetails, shortSha } from "./command-exec.ts";
import { commandStreamPrLinks, linkifyPrReferences } from "./command-stream.ts";
import { COMMAND_NAME, STATUS_KEY } from "./constants.ts";
import { emptyResult, errorMessage, LandStackError } from "./errors.ts";
import { restackForSubmitArgs, restackTargetForSubmit, submitUpdateArgs } from "./landing-plan.ts";
import { formatPrSubmitRequirement } from "./pr-facts.ts";
import type {
	CommandStreamMessageDetails,
	DescendantMaintenancePlan,
	ExtensionCommandContext,
	LandedPr,
	LandingPlan,
	LandingWarning,
	NotifyLevel,
} from "./types.ts";
import { formatConflict, formatSlotConflict } from "./worktrees.ts";

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
	const landedText = landed.map((entry) => `#${entry.number} ${entry.branch}`).join(", ");
	const lines = [`Landed ${landed.length} PR${landed.length === 1 ? "" : "s"}: ${landedText}.`];
	if (descendantMaintenance.kind === "auto" && descendantMaintenance.branches.length > 0) {
		lines.push(
			hasDescendantMaintenanceWarning(warnings)
				? `Left open; restack/update needs follow-up: ${descendantMaintenance.branches.join(", ")}.`
				: `Left open/restacked: ${descendantMaintenance.branches.join(", ")}.`,
		);
	} else if (descendantMaintenance.kind === "skipped") {
		lines.push(`Left open; restack/update skipped: ${descendantMaintenance.branches.join(", ")}.`);
		lines.push(`Reason: ${descendantMaintenance.reason}.`);
	}
	lines.push("Remote branches were not deleted.");
	lines.push("Clean up any remaining local branches manually, for example by running `gt sync` or deleting branches directly.");
	if (warnings.length > 0) {
		lines.push("", `Completed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}:`);
		for (const warning of warnings) {
			lines.push(...formatLandingWarning(warning));
		}
	}
	return lines.join("\n");
}

function hasDescendantMaintenanceWarning(warnings: LandingWarning[]): boolean {
	return warnings.some((warning) => warning.message.toLowerCase().includes("descendant"));
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

export function formatFailedTarget(error: LandStackError): string {
	const parts: string[] = [];
	if (error.failedPr) parts.push(`#${error.failedPr}`);
	if (error.failedBranch) parts.push(error.failedBranch);
	return parts.join(" ") || "unknown";
}

export function formatSuccessNotification(message: string, details?: CommandStreamMessageDetails): string {
	const firstLine = firstNonEmptyLine(message) ?? "land-stack completed.";
	return details ? linkifyPrReferences(firstLine, commandStreamPrLinks(details)) : firstLine;
}

export function formatFailureNotification(error: unknown): string {
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

export function present(ctx: ExtensionCommandContext, message: string, level: NotifyLevel): void {
	presentBrief(ctx, message, level, message);
}

export function presentBrief(ctx: ExtensionCommandContext, fullMessage: string, level: NotifyLevel, uiMessage: string): void {
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

export function setStatus(ctx: ExtensionCommandContext, message: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, message ? `land-stack: ${message}` : undefined);
	}
}

function firstNonEmptyLine(output: string): string | undefined {
	return output.split("\n").map((line) => line.trim()).find(Boolean);
}

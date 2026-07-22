// Flow land presentation: the result, confirmation, and message surface for the `ns flow land` command face.
//
// Consolidates result-block/confirmation rendering, plan/warning/failure/success formatting,
// and command-context presentation/notification helpers. Live matrix progress mechanics live in
// `land-matrix-progress.ts`.
//
// `land` reports typed settled outcomes at the Flow CLI edge. The generic finite block layout
// lives in `@nseng-ai/foundation/cli-theme` because the repeated shape was proven across Flow and
// Sibling capabilities consume this; land keeps this local facade because the Pi command-stream path must remain ANSI-free and
// domain-specific land facts stay in Flow/Land-owned code.

import type { Caps } from "@nseng-ai/clinkr";
import { formatCommand } from "@nseng-ai/foundation/command";
import { renderResultBlock, renderResultBlockFromMessage } from "@nseng-ai/foundation/cli-theme";
import {
	linkifyPrReferences,
	prLinksFromDetails,
	truncateDisplayLine,
} from "@nseng-ai/foundation/terminal-presentation";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import { shortSha } from "../commit-display/index.ts";
import { formatCommandDetails } from "./stack/command-exec.ts";
import {
	commandStreamDetailsForLanded,
	type LandStackCommandStream,
} from "./stack/command-stream.ts";
import { COMMAND_NAME, STATUS_KEY } from "./stack/constants.ts";
import {
	emptyResult,
	landFailure,
	landingFailureFacts,
	type LandingFailure,
	type LandingFailureFacts,
	type LandResult,
} from "./results.ts";
import { landUsageOptionRows, landUsageTokens } from "./stack/flags.ts";
import type { LandConfirmationRequest } from "./execution/host-seams.ts";
import {
	formatPrSubmitRequirementLine,
	postLandingCleanupCommands,
	submitRequiredUpdatesCommands,
} from "./confirmation-commands.ts";
import { restackTargetForSubmit } from "./graphite-operations.ts";
import type {
	CommandStreamMessageDetails,
	LandResultKind,
	LandStackCommandContext,
	NotifyLevel,
	PrintAwareLandStackCommandContext,
} from "./stack/types.ts";
import type { RemainingCleanup } from "./execution/merge-loop.ts";
import { formatConflict, formatSlotConflict, slotFreeArgs } from "./worktree-paths.ts";
import type {
	DescendantMaintenancePlan,
	LandedPullRequest,
	LandingPlan,
	LandingWarning,
	PostLandingSlotCleanupReport,
} from "./types.ts";

// --------------------------------------------------------------------------
// Result blocks and confirmation rendering
// --------------------------------------------------------------------------

export type { LandResultKind };

export interface LandResultBlock {
	kind: LandResultKind;
	/** Leading one-line summary (already-phrased prose); rendered bold + intent-painted with a glyph. */
	headline: string;
	/**
	 * Domain-authored detail at normal weight: the plan preview, partial-success "already landed"
	 * list, failure cause + command details, or post-landing cleanup details. Built by the typed
	 * formatters in this module; passed through as-is so this stays a pure layout primitive.
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
		const commands = submitRequiredUpdatesCommands({
			landingTargetBranch: stack.landingTargetBranch,
			...(restackTarget === undefined ? {} : { restackTarget }),
		});
		for (const command of commands) {
			lines.push(`  Command: ${command}`);
		}
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
		"Fast path requires Graphite to prove a single-branch PR shape. Stack path lands bottom branch through current branch, one PR at a time, and maintains descendants when possible.",
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
	landed: LandedPullRequest[],
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

export function formatFailure(
	failure: LandingFailure,
	landed: readonly LandedPullRequest[],
): string {
	return formatFailureFields(failurePresentationFields(failure), landed);
}

function formatFailureFields(
	fields: LandingFailureFacts,
	landed: readonly LandedPullRequest[],
): string {
	const { displayCommand, execResult, failedBranch, failedPrNumber, suggestedAction } = fields;
	const simple =
		landed.length === 0 && !displayCommand && !failedBranch && !failedPrNumber && !suggestedAction;
	if (simple) return fields.message;

	const lines = ["land stopped."];
	if (landed.length > 0) {
		lines.push("", "Already landed:");
		for (const entry of landed) {
			lines.push(`  - #${entry.number} ${entry.branch}`);
		}
	}
	if (failedBranch || failedPrNumber) {
		lines.push("", `Failed at: ${formatFailedTargetFields(fields)}`);
	}
	lines.push("", fields.message);
	if (displayCommand || execResult) {
		// Boundary failures whose message already embeds the rendered command details (the adapters
		// do this) keep the legacy single-render output; the structured diagnostics stay intact.
		const commandDetails = formatCommandDetails(execResult ?? emptyResult(), displayCommand);
		if (!fields.message.includes(commandDetails)) {
			lines.push("", commandDetails);
		}
	}
	if (suggestedAction) {
		lines.push("", `Suggested next action: ${suggestedAction}`);
	}
	return lines.join("\n");
}

export function formatFailedTarget(failure: LandingFailure): string {
	return formatFailedTargetFields(failurePresentationFields(failure));
}

function formatFailedTargetFields(fields: LandingFailureFacts): string {
	const parts: string[] = [];
	if (fields.failedPrNumber) parts.push(`#${fields.failedPrNumber}`);
	if (fields.failedBranch) parts.push(fields.failedBranch);
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

export function formatFailureNotification(failure: LandingFailure): string {
	return formatFailureNotificationFields(failurePresentationFields(failure));
}

function formatFailureNotificationFields(fields: LandingFailureFacts): string {
	const detail = firstNonEmptyLine(fields.message) ?? "unknown error";
	if (fields.failedBranch || fields.failedPrNumber) {
		return `land stopped at ${formatFailedTargetFields(fields)}: ${detail}`;
	}
	if (fields.level === "info") return detail;
	return `land stopped: ${detail}`;
}

export interface LandFailurePresentation {
	readonly fullMessage: string;
	readonly level: NotifyLevel;
	readonly uiMessage: string;
	readonly kind: LandResultKind;
}

export function buildLandFailurePresentation(
	failure: LandingFailure,
	landed: readonly LandedPullRequest[],
): LandFailurePresentation {
	const fields = failurePresentationFields(failure);
	return {
		fullMessage: formatFailureFields(fields, landed),
		level: fields.level,
		uiMessage: formatFailureNotificationFields(fields),
		kind: fields.outcome === "refusal" ? "refusal" : "failure",
	};
}

export function presentFailureAndReturn(
	ctx: PrintAwareLandStackCommandContext,
	failure: LandingFailure,
): LandResult<never> {
	presentBrief({ ctx, ...buildLandFailurePresentation(failure, []) });
	return landFailure(failure);
}

export function failureLevel(failure: LandingFailure): NotifyLevel {
	return landingFailureFacts(failure).level;
}

function failurePresentationFields(failure: LandingFailure): LandingFailureFacts {
	const facts = landingFailureFacts(failure);
	if (failure.type !== "domain" || failure.reason !== "dirty-worktree") return facts;
	return { ...facts, message: "Working tree is dirty; refusing to start stack landing." };
}

/** Map a typed failure onto its house-style visual intent without changing exit-code routing. */
export function failureKind(failure: LandingFailure): LandResultKind {
	return landingFailureFacts(failure).outcome === "refusal" ? "refusal" : "failure";
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
	landed: readonly LandedPullRequest[];
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

export function singleBranchMainLandingConfirmationTitle(): string {
	return "Land this PR?";
}

export function formatSingleBranchMainLandingConfirmationDetails(
	request: Extract<LandConfirmationRequest, { readonly kind: "single-branch-main-landing" }>,
): string {
	return [
		`PR: #${request.pullRequest.number} ${request.pullRequest.title}`,
		`Head branch: ${request.pullRequest.headRefName}`,
		`Target trunk: ${request.trunk}`,
	].join("\n");
}

export function singleBranchMainLandingNonInteractiveRefusalMessage(
	request: Extract<LandConfirmationRequest, { readonly kind: "single-branch-main-landing" }>,
): string {
	return `Refusing to land a single-branch PR without confirmation in non-interactive mode. Re-run with --yes.\n\n${formatSingleBranchMainLandingConfirmationDetails(request)}`;
}

export function formatSingleBranchDryRunNotification(
	pullRequestNumber: number,
	trunk: string,
): string {
	return `Dry run only; would merge PR #${pullRequestNumber} into ${trunk}.`;
}

export function formatSingleBranchLandingSuccessNotification(options: {
	readonly pullRequestNumber: number;
	readonly commandOutput: string;
}): string {
	const message = `Merged PR #${options.pullRequestNumber}; squash commit used PR title/body.`;
	return options.commandOutput ? `${options.commandOutput}\n${message}` : message;
}

export function freeManagedSlotsConfirmationTitle(): string {
	return "Free landing slots?";
}

export function formatFreeManagedSlotsConfirmationDetails(
	request: Extract<LandConfirmationRequest, { readonly kind: "free-managed-slots" }>,
): string {
	const commandDisplay = formatCommand("ns", ["slot", ...slotFreeArgs(request.slots)]);
	return [
		"Run targeted slot cleanup? This detaches/frees managed slots for landing branches only.",
		"",
		...request.slots.map((slot) => `- ${formatSlotConflict(slot)}`),
		"",
		`Command: ${commandDisplay}`,
	].join("\n");
}

export function freeManagedSlotsNonInteractiveRefusalMessage(
	request: Extract<LandConfirmationRequest, { readonly kind: "free-managed-slots" }>,
): string {
	const details = formatFreeManagedSlotsConfirmationDetails(request);
	const commandDisplay = formatCommand("ns", ["slot", ...slotFreeArgs(request.slots)]);
	return [
		"Managed slot worktrees for landing branches block stack restack/ref updates, but this context cannot ask for the required slot cleanup confirmation.",
		details,
		`No PRs were landed. Run \`${commandDisplay}\` manually if appropriate, then rerun /ns:flow:land --yes.`,
	].join("\n");
}

export function formatPrSubmitRequirement(
	requirement: Pick<
		Extract<
			LandConfirmationRequest,
			{ readonly kind: "submit-required-updates" }
		>["requirements"][number],
		"branch" | "prNumber" | "reasons"
	>,
): string {
	return formatPrSubmitRequirementLine(requirement);
}

export function submitRequiredUpdatesConfirmationTitle(
	request: Extract<LandConfirmationRequest, { readonly kind: "submit-required-updates" }>,
): string {
	return request.restackRequirements.length > 0
		? "Run gt restack + submit/update?"
		: "Run gt submit/update?";
}

export function formatSubmitRequiredUpdatesConfirmationDetails(
	request: Extract<LandConfirmationRequest, { readonly kind: "submit-required-updates" }>,
): string {
	const restackTarget = request.restackTarget;
	const commands = submitRequiredUpdatesCommands(request);
	const lines = [
		restackTarget === undefined
			? "GitHub PR metadata is behind local Graphite refs. Run Graphite submit/update before merging?"
			: "Local branch reachability shows this stack needs restack before submit/update, and GitHub PR metadata is behind local refs. Run restack then submit/update before merging?",
		"",
	];
	if (restackTarget !== undefined) {
		lines.push(
			"Landing branches needing restack:",
			...request.restackRequirements.map(
				(requirement) => `- ${requirement.branch} on ${requirement.parent}`,
			),
			"",
		);
	}
	lines.push(
		"PR metadata to update:",
		...request.requirements.map(formatPrSubmitRequirementLine),
		"",
		"Commands:",
		...commands.map((command) => `$ ${command}`),
	);
	return lines.join("\n");
}

export function submitRequiredUpdatesNonInteractiveRefusalMessage(
	request: Extract<LandConfirmationRequest, { readonly kind: "submit-required-updates" }>,
): string {
	const details = formatSubmitRequiredUpdatesConfirmationDetails(request);
	const commands = submitRequiredUpdatesCommands(request);
	const manualCommandText = commands.map((command) => `\`${command}\``).join(" then ");
	const actionName =
		request.restackTarget === undefined ? "submit/update" : "restack + submit/update";
	return [
		`GitHub PR metadata is behind local Graphite refs, but this context cannot ask for the required ${actionName} confirmation.`,
		details,
		`No PRs were landed. Run ${manualCommandText} manually, then rerun /ns:flow:land --yes.`,
	].join("\n");
}

export function submitRequiredUpdatesSuggestedAction(
	request: Extract<LandConfirmationRequest, { readonly kind: "submit-required-updates" }>,
): string {
	const commands = submitRequiredUpdatesCommands(request);
	return `Run ${commands.map((command) => `\`${command}\``).join(" then ")} manually, then rerun /ns:flow:land --yes.`;
}

export function postLandingCleanupConfirmationTitle(): string {
	return "Free current slot and delete local branch?";
}

export function formatPostLandingCleanupConfirmationDetails(
	request: Extract<LandConfirmationRequest, { readonly kind: "post-landing-cleanup" }>,
): string {
	const keepsTrunk = request.localBranchDisposition === "keep-trunk";
	const commands = postLandingCleanupCommands(request);
	return [
		keepsTrunk
			? "Post-landing cleanup will detach the current managed slot to trunk. The local trunk branch is kept."
			: "Post-landing cleanup will detach the current managed slot to trunk, then delete the landed local Graphite branch.",
		"",
		`Slot: ${request.slotName}`,
		`Worktree: ${request.repoRoot}`,
		keepsTrunk
			? `Local branch: ${request.branch} (trunk; will not be deleted)`
			: `Local branch: ${request.branch}`,
		"",
		"Commands:",
		...commands.map((command) => `$ ${command}`),
	].join("\n");
}

/** Success notice for a completed post-landing cleanup, derived from the observed report facts. */
export function formatPostLandingCleanupSuccessNotice(
	outcome: Extract<PostLandingSlotCleanupReport, { readonly type: "completed" }>,
): string {
	const slotName = outcome.freedSlot.slotName ?? outcome.freedSlot.path;
	return outcome.deletedLocalBranch !== undefined
		? `Post-landing cleanup complete: freed ${slotName} and deleted local branch ${outcome.deletedLocalBranch}.`
		: `Post-landing cleanup complete: freed ${slotName}; local trunk branch ${outcome.keptTrunkBranch ?? outcome.freedSlot.branch} was kept.`;
}

export function postLandingCleanupNonInteractiveRefusalMessage(
	request: Extract<LandConfirmationRequest, { readonly kind: "post-landing-cleanup" }>,
): string {
	return [
		"Refusing to land before merge: post-landing slot cleanup requires confirmation in non-interactive mode. No PRs were landed.",
		formatPostLandingCleanupConfirmationDetails(request),
		"Re-run with --yes or --force to approve cleanup, or --preserve to land while keeping the current managed slot and local branch.",
	].join("\n\n");
}

export function setStatus(ctx: LandStackCommandContext, message: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, message ? `land: ${message}` : undefined);
	}
}

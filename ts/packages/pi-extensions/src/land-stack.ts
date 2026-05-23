import { formatCommand } from "./command-runtime.ts";
import {
	LandStackCommandStream,
	commandStreamDetailsForLanded,
	renderCommandStreamMessage,
	withCommandStreaming,
} from "./land-stack/command-stream.ts";
import { COMMAND_NAME, COMMAND_STREAM_MESSAGE_TYPE } from "./land-stack/constants.ts";
import { fail, LandStackError } from "./land-stack/errors.ts";
import { buildLandingPlan, submitUpdateArgs } from "./land-stack/landing-plan.ts";
import {
	confirmAndFreeManagedSlots,
	confirmAndSubmitRequiredPrUpdates,
	formatRemainingSubmitRequirements,
	runMergeLoop,
} from "./land-stack/landing-operations.ts";
import {
	formatFailure,
	formatFailureNotification,
	formatPlan,
	formatSuccessNotification,
	formatSuccessSummary,
	present,
	presentBrief,
	setStatus,
	usage,
} from "./land-stack/presentation.ts";
import type { ExtensionAPI, ExtensionCommandContext, LandedPr, LandingWarning, ParsedArgs } from "./land-stack/types.ts";

export { formatCommand } from "./command-runtime.ts";
export type { ExecResult } from "./command-runtime.ts";
export { isGtDeleteCheckedOutElsewhere, isGtDeleteMissingBranch, outputTail, shortSha, stripAnsi } from "./land-stack/command-exec.ts";
export { LandStackError } from "./land-stack/errors.ts";
export type { LandStackErrorOptions } from "./land-stack/errors.ts";
export { validateInitialPrPreflight, validateOpenPrBasics, validateStrictMergeGate } from "./land-stack/pr-facts.ts";
export { formatFailure, formatPlan } from "./land-stack/presentation.ts";
export { parseGtStackOutput } from "./land-stack/stack-facts.ts";
export type {
	AutocompleteItem,
	BranchPlan,
	ExtensionAPI,
	ExtensionCommandContext,
	LandedPr,
	LandingPlan,
	NotifyLevel,
	ParsedArgs,
	ParsedStackOutput,
	PrSubmitRequirement,
	PullRequestSnapshot,
	RestackRequirement,
	StackSnapshot,
	WorktreeConflict,
	WorktreeEntry,
} from "./land-stack/types.ts";
export { isManagedSlotPath, parseWorktreeList, slotNameFromPath } from "./land-stack/worktrees.ts";

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
			const warnings: LandingWarning[] = [];
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

				await runMergeLoop(runtimePi, ctx, plan, landed, warnings, { commandStream, unstreamedPi: pi });

				const successSummary = formatSuccessSummary(landed, plan.stack.descendantBranches, warnings);
				const completionLevel = warnings.length > 0 ? "warning" : "success";
				const commandStreamDetails = commandStreamDetailsForLanded(landed);
				commandStream.finishSuccess(successSummary, commandStreamDetails);
				presentBrief(ctx, successSummary, completionLevel, formatSuccessNotification(successSummary, commandStreamDetails));
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

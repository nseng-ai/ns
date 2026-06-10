import { formatCommand } from "@asdl/core/exec";
import {
	LandStackCommandStream,
	commandStreamDetailsForLanded,
	renderCommandStreamMessage,
	withCommandStreaming,
} from "./land-stack/command-stream.ts";
import { COMMAND_NAME, COMMAND_STREAM_MESSAGE_TYPE } from "./land-stack/constants.ts";
import { errorMessage, failure, landStackFailure, success, type LandStackFailure, type LandStackResult } from "./land-stack/errors.ts";
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
import type { LandStackCommandContext, LandStackExtensionAPI, LandedPr, LandingShape, LandingWarning, ParsedArgs } from "./land-stack/types.ts";

export type { LandStackExtensionAPI } from "./land-stack/types.ts";

export interface ExecuteStackLandingOptions {
	skipMainConfirmation?: boolean;
	initialShape?: LandingShape;
}

export function registerLandStackRenderer(pi: Pick<LandStackExtensionAPI, "registerMessageRenderer">): void {
	pi.registerMessageRenderer?.(COMMAND_STREAM_MESSAGE_TYPE, renderCommandStreamMessage);
}

export function landArgumentCompletions(prefix: string): Array<{ value: string; label: string }> | null {
	const options = ["--yes", "--dry-run", "--help"];
	const token = prefix.trim().split(/\s+/).pop() ?? "";
	const filtered = options.filter((option) => option.startsWith(token));
	return filtered.length > 0 ? filtered.map((option) => ({ value: option, label: option })) : null;
}

export async function executeStackLanding(
	pi: LandStackExtensionAPI,
	ctx: LandStackCommandContext,
	parsedArgs: ParsedArgs,
	options: ExecuteStackLandingOptions = {},
): Promise<void> {
	const landed: LandedPr[] = [];
	const warnings: LandingWarning[] = [];
	const commandStream = new LandStackCommandStream(pi, ctx);
	const runtimePi = withCommandStreaming(pi, commandStream);
	try {
		if (parsedArgs.help) {
			present(ctx, usage(), "info");
			return;
		}

		setStatus(ctx, "preflighting...");
		let plan = await buildLandingPlan(runtimePi, ctx.cwd, {
			allowSubmitRequiredState: true,
			...(options.initialShape ? { preloadedShape: options.initialShape } : {}),
		});
		if (plan.type === "failure") {
			presentLandStackFailure({ ctx, commandStream, landed, failure: plan.failure });
			return;
		}
		const planText = formatPlan(plan.value);

		if (parsedArgs.dryRun) {
			commandStream.finishSuccess("Dry run only; no PRs or local refs were changed.");
			present(ctx, `Dry run only; no PRs or local refs were changed.\n\n${planText}`, "info");
			return;
		}

		if (!parsedArgs.yes && !options.skipMainConfirmation) {
			if (!ctx.hasUI) {
				presentLandStackFailure({
					ctx,
					commandStream,
					landed,
					failure: landStackFailure(`Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${planText}`),
				});
				return;
			}
			const confirmed = await ctx.ui.confirm("Land this stack path?", planText);
			if (!confirmed) {
				presentLandStackFailure({
					ctx,
					commandStream,
					landed,
					failure: landStackFailure("Cancelled before merge; no PRs were landed.", { level: "info" }),
				});
				return;
			}
		}

		if (plan.value.prSubmitRequirements.length > 0) {
			const submitOutcome = await confirmAndSubmitRequiredPrUpdates(runtimePi, ctx, plan.value);
			if (submitOutcome.type === "failure") {
				presentLandStackFailure({ ctx, commandStream, landed, failure: submitOutcome.failure });
				return;
			}
			setStatus(ctx, "rechecking preflight...");
			plan = await buildLandingPlan(runtimePi, ctx.cwd, { allowSubmitRequiredState: true });
			if (plan.type === "failure") {
				presentLandStackFailure({ ctx, commandStream, landed, failure: plan.failure });
				return;
			}
			if (plan.value.prSubmitRequirements.length > 0) {
				presentLandStackFailure({
					ctx,
					commandStream,
					landed,
					failure: landStackFailure(formatRemainingSubmitRequirements(plan.value.prSubmitRequirements), {
						suggestedAction: `Run ${formatCommand("gt", submitUpdateArgs(plan.value.stack.current))} manually, inspect PR heads, and rerun /code:land.`,
					}),
				});
				return;
			}
		}

		if (plan.value.managedSlotConflicts.length > 0) {
			const slotOutcome = await confirmAndFreeManagedSlots(runtimePi, ctx, plan.value);
			if (slotOutcome.type === "failure") {
				presentLandStackFailure({ ctx, commandStream, landed, failure: slotOutcome.failure });
				return;
			}
		}

		const mergeOutcome = await runMergeLoop(runtimePi, ctx, plan.value, landed, warnings, { commandStream, unstreamedPi: pi });
		if (mergeOutcome.type === "failure") {
			presentLandStackFailure({ ctx, commandStream, landed, failure: mergeOutcome.failure });
			return;
		}

		const successSummary = formatSuccessSummary(landed, plan.value.descendantMaintenance, warnings);
		const hasWarnings = warnings.some((warning) => (warning.level ?? "warning") === "warning");
		const completionLevel = hasWarnings ? "warning" : "success";
		const commandStreamDetails = commandStreamDetailsForLanded(landed);
		commandStream.finishSuccess(successSummary, commandStreamDetails);
		presentBrief(ctx, successSummary, completionLevel, formatSuccessNotification(successSummary, { details: commandStreamDetails, warnings }));
	} catch (error) {
		presentLandStackFailure({
			ctx,
			commandStream,
			landed,
			failure: landStackFailure(`land failed unexpectedly: ${errorMessage(error)}`),
		});
	} finally {
		setStatus(ctx, undefined);
	}
}

interface PresentLandStackFailureOptions {
	ctx: LandStackCommandContext;
	commandStream: LandStackCommandStream;
	landed: readonly LandedPr[];
	failure: LandStackFailure;
}

function presentLandStackFailure(options: PresentLandStackFailureOptions): void {
	const { ctx, commandStream, landed, failure } = options;
	const formatted = formatFailure(failure, landed);
	commandStream.finishFailure(formatted);
	presentBrief(ctx, formatted, failure.level, formatFailureNotification(failure));
}

export function parseArgs(argsText: string): LandStackResult<ParsedArgs> {
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
			return failure(landStackFailure(`Unknown /${COMMAND_NAME} argument: ${part}\n\n${usage()}`));
		}
	}

	return success(parsed);
}

import type { SdlCommandIo } from "sdl-sdk";
import { formatErrorMessage } from "@sdl/core/primitives";
import {
	LandStackCommandStream,
	commandStreamDetailsForLanded,
	createLandUiCommandIo,
	renderCommandStreamMessage,
	withCommandStreaming,
} from "./land-stack/command-stream.ts";
import {
	AUTO_CHUNK_LANDING_THRESHOLD,
	COMMAND_NAME,
	COMMAND_STREAM_MESSAGE_TYPE,
} from "./land-stack/constants.ts";
import {
	completed,
	failure,
	landStackFailure,
	success,
	type LandStackOutcome,
	type LandStackResult,
} from "./land-stack/errors.ts";
import { executeChunkedStackLanding } from "./land-stack/chunked-landing.ts";
import { buildLandingPlan } from "./land-stack/landing-plan.ts";
import {
	formatPreparingLandingMilestone,
	preparePlanForMerge,
	presentLandStackFailure,
} from "./land-stack/landing-coordination.ts";
import { runMergeLoop, type PreMergeConfirmation } from "./land-stack/landing-operations.ts";
import {
	formatPlan,
	formatSuccessNotification,
	formatSuccessSummary,
	present,
	presentBrief,
	setStatus,
	usage,
} from "./land-stack/presentation.ts";
import { loadLandingShape } from "./land-stack/stack-facts.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandedChunk,
	LandedPr,
	LandingPlan,
	LandingShape,
	LandingWarning,
	ParsedArgs,
} from "./land-stack/types.ts";

export type { LandStackExtensionAPI } from "./land-stack/types.ts";

export interface ExecuteStackLandingOptions {
	io?: SdlCommandIo;
	skipMainConfirmation?: boolean;
	preMergeConfirmation?: PreMergeConfirmation;
	initialShape?: LandingShape;
}

export function registerLandStackRenderer(
	pi: Pick<LandStackExtensionAPI, "registerMessageRenderer">,
): void {
	pi.registerMessageRenderer?.(COMMAND_STREAM_MESSAGE_TYPE, renderCommandStreamMessage);
}

export function landArgumentCompletions(
	prefix: string,
): Array<{ value: string; label: string }> | null {
	const options = ["--yes", "--dry-run", "--free", "--force", "--help"];
	const token = prefix.trim().split(/\s+/).pop() ?? "";
	const filtered = options.filter((option) => option.startsWith(token));
	return filtered.length > 0 ? filtered.map((option) => ({ value: option, label: option })) : null;
}

export async function executeStackLanding(
	pi: LandStackExtensionAPI,
	ctx: LandStackCommandContext,
	parsedArgs: ParsedArgs,
	options: ExecuteStackLandingOptions = {},
): Promise<LandStackOutcome> {
	const landed: LandedPr[] = [];
	const landedChunks: LandedChunk[] = [];
	const warnings: LandingWarning[] = [];
	const io = options.io ?? createLandUiCommandIo(pi, ctx);
	const commandStream = new LandStackCommandStream(io, {
		shouldShowRunningCommandStatus: ctx.hasUI,
	});
	const runtimePi = withCommandStreaming(pi, commandStream);
	try {
		if (parsedArgs.shouldShowHelp) {
			present({ ctx, message: usage(), level: "info" });
			return completed();
		}

		setStatus(ctx, "preflighting...");
		const shape = options.initialShape
			? success(options.initialShape)
			: await loadLandingShape(runtimePi, ctx.cwd);
		if (shape.type === "failure") {
			presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: shape.failure });
			return failure(shape.failure);
		}

		if (shape.value.stack.landingBranches.length > AUTO_CHUNK_LANDING_THRESHOLD) {
			return await executeChunkedStackLanding({
				pi,
				runtimePi,
				ctx,
				parsedArgs,
				options,
				commandStream,
				initialShape: shape.value,
				landed,
				landedChunks,
				warnings,
			});
		}

		const plan = await buildLandingPlan(runtimePi, ctx.cwd, {
			allowSubmitRequiredState: true,
			preloadedShape: shape.value,
		});
		if (plan.type === "failure") {
			presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: plan.failure });
			return failure(plan.failure);
		}
		return await executeSinglePlanLanding({
			pi,
			runtimePi,
			ctx,
			parsedArgs,
			options,
			commandStream,
			plan: plan.value,
			landed,
			landedChunks,
			warnings,
		});
	} catch (error) {
		const landFailure = landStackFailure(`land failed unexpectedly: ${formatErrorMessage(error)}`);
		presentLandStackFailure({
			ctx,
			commandStream,
			landed,
			landedChunks,
			failure: landFailure,
		});
		return failure(landFailure);
	} finally {
		setStatus(ctx, undefined);
	}
}

interface ExecuteSinglePlanLandingOptions {
	pi: LandStackExtensionAPI;
	runtimePi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	parsedArgs: ParsedArgs;
	options: ExecuteStackLandingOptions;
	commandStream: LandStackCommandStream;
	plan: LandingPlan;
	landed: LandedPr[];
	landedChunks: LandedChunk[];
	warnings: LandingWarning[];
}

async function executeSinglePlanLanding(
	singleOptions: ExecuteSinglePlanLandingOptions,
): Promise<LandStackResult<void>> {
	const {
		pi,
		runtimePi,
		ctx,
		parsedArgs,
		options,
		commandStream,
		plan,
		landed,
		landedChunks,
		warnings,
	} = singleOptions;
	const planText = formatPlan(plan);

	if (parsedArgs.isDryRun) {
		commandStream.finishSuccess("Dry run only; no PRs or local refs were changed.");
		present({
			ctx,
			message: `Dry run only; no PRs or local refs were changed.\n\n${planText}`,
			level: "info",
			kind: "success",
		});
		return success(undefined);
	}

	if (!parsedArgs.shouldSkipConfirmation && !options.skipMainConfirmation) {
		if (!ctx.hasUI) {
			const landFailure = landStackFailure(
				`Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${planText}`,
				{ outcome: "refusal" },
			);
			presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: landFailure });
			return failure(landFailure);
		}
		const confirmed = await ctx.ui.confirm("Land this stack path?", planText);
		if (!confirmed) {
			const landFailure = landStackFailure("Cancelled before merge; no PRs were landed.", {
				level: "info",
				outcome: "refusal",
			});
			presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: landFailure });
			return failure(landFailure);
		}
	}

	commandStream.note(formatPreparingLandingMilestone(plan));
	const readyPlan = await preparePlanForMerge({
		runtimePi,
		ctx,
		plan,
		landed,
		landedChunks,
		commandStream,
		...(options.preMergeConfirmation === undefined
			? {}
			: { preMergeConfirmation: options.preMergeConfirmation }),
	});
	if (readyPlan.type === "failure") return readyPlan;

	const mergeOutcome = await runMergeLoop({
		pi: runtimePi,
		ctx,
		plan: readyPlan.value,
		landed,
		warnings,
		commandStream,
		unstreamedPi: pi,
	});
	if (mergeOutcome.type === "failure") {
		presentLandStackFailure({
			ctx,
			commandStream,
			landed,
			landedChunks,
			failure: mergeOutcome.failure,
		});
		return mergeOutcome;
	}

	const successSummary = formatSuccessSummary(
		landed,
		readyPlan.value.descendantMaintenance,
		warnings,
		mergeOutcome.value,
	);
	const hasWarnings = warnings.some((warning) => (warning.level ?? "warning") === "warning");
	const completionLevel = hasWarnings ? "warning" : "success";
	const commandStreamDetails = commandStreamDetailsForLanded(landed);
	commandStream.finishSuccess(successSummary, commandStreamDetails);
	presentBrief({
		ctx,
		fullMessage: successSummary,
		level: completionLevel,
		uiMessage: formatSuccessNotification(successSummary, {
			...(commandStreamDetails === undefined ? {} : { details: commandStreamDetails }),
			warnings,
		}),
		kind: "success",
	});
	return success(undefined);
}

export function parseArgs(argsText: string): LandStackResult<ParsedArgs> {
	const parsed: ParsedArgs = {
		shouldSkipConfirmation: false,
		isDryRun: false,
		shouldFreeSlot: false,
		shouldForceCleanup: false,
		shouldShowHelp: false,
	};
	const parts = argsText.trim().split(/\s+/).filter(Boolean);

	for (const part of parts) {
		if (part === "--yes" || part === "-y") {
			parsed.shouldSkipConfirmation = true;
		} else if (part === "--dry-run") {
			parsed.isDryRun = true;
		} else if (part === "--free") {
			parsed.shouldFreeSlot = true;
		} else if (part === "--force" || part === "-f") {
			parsed.shouldForceCleanup = true;
		} else if (part === "--help" || part === "-h") {
			parsed.shouldShowHelp = true;
		} else {
			return failure(landStackFailure(`Unknown /${COMMAND_NAME} argument: ${part}\n\n${usage()}`));
		}
	}

	return success(parsed);
}

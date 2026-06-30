import { LandStackCommandStream } from "./command-stream.ts";
import { success, type LandStackResult } from "./errors.ts";
import {
	confirmMainLanding,
	formatPreparingLandingMilestone,
	preparePlanForMerge,
	presentLandStackFailure,
} from "./landing-coordination.ts";
import { runMergeLoop, type PreMergeConfirmation } from "./landing-operations.ts";
import {
	formatPlan,
	formatSuccessSummary,
	presentDryRunLanding,
	presentLandingSuccess,
} from "./presentation.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandedChunk,
	LandedPr,
	LandingPlan,
	LandingWarning,
	ParsedArgs,
} from "./types.ts";

interface ExecuteSinglePlanLandingOptions {
	pi: LandStackExtensionAPI;
	runtimePi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	parsedArgs: ParsedArgs;
	options: {
		shouldSkipMainConfirmation?: boolean;
		preMergeConfirmation?: PreMergeConfirmation;
	};
	commandStream: LandStackCommandStream;
	plan: LandingPlan;
	landed: LandedPr[];
	landedChunks: LandedChunk[];
	warnings: LandingWarning[];
}

export async function executeSinglePlanLanding(
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
		presentDryRunLanding({ ctx, commandStream, planText });
		return success(undefined);
	}

	const confirmation = await confirmMainLanding({
		ctx,
		commandStream,
		landed,
		landedChunks,
		shouldPrompt: !parsedArgs.shouldSkipConfirmation && !options.shouldSkipMainConfirmation,
		title: "Land this stack path?",
		details: planText,
		nonInteractiveMessage: `Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${planText}`,
	});
	if (confirmation.type === "failure") return confirmation;

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
	presentLandingSuccess({ ctx, commandStream, landed, warnings, successSummary });
	return success(undefined);
}

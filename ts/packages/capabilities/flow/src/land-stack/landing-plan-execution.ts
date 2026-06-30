import { success, type LandStackResult } from "./errors.ts";
import {
	confirmMainLanding,
	formatPreparingLandingMilestone,
	preparePlanForMerge,
	presentLandStackFailure,
	type LandingSession,
} from "./landing-coordination.ts";
import { runMergeLoop } from "./landing-operations.ts";
import type { PreMergeConfirmation } from "./pre-merge-submit.ts";
import {
	formatPlan,
	formatSuccessSummary,
	presentDryRunLanding,
	presentLandingSuccess,
} from "./presentation.ts";
import type { LandStackExtensionAPI, LandingPlan, LandingWarning, ParsedArgs } from "./types.ts";

interface ExecuteLandingPlanOptions {
	pi: LandStackExtensionAPI;
	runtimePi: LandStackExtensionAPI;
	parsedArgs: ParsedArgs;
	options: {
		shouldSkipMainConfirmation?: boolean;
		preMergeConfirmation?: PreMergeConfirmation;
	};
	session: LandingSession;
	plan: LandingPlan;
	warnings: LandingWarning[];
}

export async function executeLandingPlan(
	executionOptions: ExecuteLandingPlanOptions,
): Promise<LandStackResult<void>> {
	const { pi, runtimePi, parsedArgs, options, session, plan, warnings } = executionOptions;
	const { ctx, commandStream, landed } = session;
	const planText = formatPlan(plan);

	if (parsedArgs.isDryRun) {
		presentDryRunLanding({ ctx, commandStream, planText });
		return success(undefined);
	}

	const confirmation = await confirmMainLanding({
		session,
		shouldPrompt: !parsedArgs.shouldSkipConfirmation && !options.shouldSkipMainConfirmation,
		title: "Land this stack path?",
		details: planText,
		nonInteractiveMessage: `Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${planText}`,
	});
	if (confirmation.type === "failure") return confirmation;

	commandStream.note(formatPreparingLandingMilestone(plan));
	const readyPlan = await preparePlanForMerge({
		runtimePi,
		session,
		plan,
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
			session,
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

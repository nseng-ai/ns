import { success, type LandStackResult } from "./errors.ts";
import {
	confirmMainLanding,
	formatPreparingLandingMilestone,
	preparePlanForMerge,
	presentLandStackFailure,
	type LandingSession,
} from "./landing-coordination.ts";
import { runMergeLoop } from "./landing-operations.ts";
import type { PreMergeConfirmation } from "./pre-merge-confirmation.ts";
import {
	formatPlan,
	formatSuccessSummary,
	presentDryRunLanding,
	presentLandingSuccess,
} from "./presentation.ts";
import type { StackLandingRuntime } from "./stack-landing-runtime.ts";
import type { LandContext } from "../api.ts";
import type { LandingPlan } from "../types.ts";
import type { LandingWarning, ParsedArgs } from "./types.ts";

interface ExecuteLandingPlanOptions {
	runtime: StackLandingRuntime;
	landContext: LandContext;
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
	const { runtime, landContext, parsedArgs, options, session, plan, warnings } = executionOptions;
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
		runtime,
		landContext,
		session,
		plan,
		...(options.preMergeConfirmation === undefined
			? {}
			: { preMergeConfirmation: options.preMergeConfirmation }),
	});
	if (readyPlan.type === "failure") return readyPlan;

	const mergeOutcome = await runMergeLoop({
		runtime,
		landContext,
		ctx,
		plan: readyPlan.value,
		landed,
		warnings,
		commandStream,
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

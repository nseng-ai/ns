import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { landMatrixRowsFromPlan } from "./land-matrix-progress.ts";
import {
	failureLevel,
	formatFailure,
	formatFailureNotification,
	formatPlan,
	formatSuccessSummary,
	landFailureKind,
	presentBrief,
	presentDryRunLanding,
	presentLandingSuccess,
} from "./land-presentation.ts";
import { buildStackLandingPlan } from "./preflight.ts";
import type { LandContext, LandingPlan, LandingWarning } from "./types.ts";
import { LandStackCommandStream } from "./stack/command-stream.ts";
import {
	failure,
	success,
	type LandFlowFailure,
	type LandStackOutcome,
	type LandStackResult,
} from "./stack/errors.ts";
import {
	confirmAndFreeManagedSlots,
	residualPreMergeFailure,
	runMergeLoop,
} from "./stack/landing-operations.ts";
import {
	confirmLandStackAction,
	type PreMergeConfirmation,
} from "./stack/pre-merge-confirmation.ts";
import { confirmAndSubmitRequiredPrUpdates } from "./stack/pre-merge-submit.ts";
import type { StackLandingRuntime } from "./stack/stack-landing-runtime.ts";
import type {
	LandProgressReporter,
	LandStackCommandContext,
	LandedPr,
	ParsedArgs,
} from "./stack/types.ts";

export interface LandingSession {
	readonly ctx: LandStackCommandContext;
	readonly commandStream: LandStackCommandStream;
	readonly progress: LandProgressReporter;
	readonly landed: LandedPr[];
}

export interface ExecuteLandingPlanOptions {
	readonly runtime: StackLandingRuntime;
	readonly parsedArgs: ParsedArgs;
	readonly options: {
		readonly shouldSkipMainConfirmation?: boolean;
		readonly preMergeConfirmation?: PreMergeConfirmation;
	};
	readonly session: LandingSession;
	readonly plan: LandingPlan;
	readonly warnings: LandingWarning[];
}

export async function executeLandingPlan(
	executionOptions: ExecuteLandingPlanOptions,
): Promise<LandStackResult<void>> {
	const { runtime, parsedArgs, options, session, plan, warnings } = executionOptions;
	const { ctx, commandStream, progress, landed } = session;
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
		session,
		plan,
		...optionalEntry("preMergeConfirmation", options.preMergeConfirmation),
	});
	if (readyPlan.type === "failure") return readyPlan;

	const mergeOutcome = await runMergeLoop({
		runtime,
		progress,
		plan: readyPlan.value,
		landed,
		warnings,
		commandStream,
	});
	if (mergeOutcome.type === "failure") {
		presentLandStackFailure({ session, failure: mergeOutcome.failure });
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

interface PreparePlanForMergeOptions {
	readonly runtime: StackLandingRuntime;
	readonly session: LandingSession;
	readonly plan: LandingPlan;
	readonly preMergeConfirmation?: PreMergeConfirmation;
}

async function preparePlanForMerge(
	options: PreparePlanForMergeOptions,
): Promise<LandStackResult<LandingPlan>> {
	const result = await preparePlanForMergeCore(options);
	if (result.type === "failure") {
		presentLandStackFailure({ session: options.session, failure: result.failure });
	}
	return result;
}

async function preparePlanForMergeCore(
	options: PreparePlanForMergeOptions,
): Promise<LandStackResult<LandingPlan>> {
	const { runtime, plan } = options;
	const { ctx, commandStream, progress } = options.session;
	const preMergeConfirmation = options.preMergeConfirmation ?? "prompt";

	if (plan.managedSlotConflicts.length === 0 && plan.prSubmitRequirements.length === 0) {
		return success(plan);
	}
	if (plan.managedSlotConflicts.length > 0) {
		const slotOutcome = await confirmAndFreeManagedSlots({
			runtime,
			ctx,
			progress,
			plan,
			confirmation: preMergeConfirmation,
		});
		if (slotOutcome.type === "failure") return slotOutcome;
	}
	if (plan.prSubmitRequirements.length > 0) {
		return await submitRequiredUpdatesAndRecheckPlan({
			ctx,
			progress,
			plan,
			landContext: runtime.landContext,
			commandStream,
			preMergeConfirmation,
		});
	}
	return success(plan);
}

async function submitRequiredUpdatesAndRecheckPlan(options: {
	readonly ctx: LandStackCommandContext;
	readonly progress: LandProgressReporter;
	readonly plan: LandingPlan;
	readonly landContext: LandContext;
	readonly commandStream: LandStackCommandStream;
	readonly preMergeConfirmation: PreMergeConfirmation;
}): Promise<LandStackResult<LandingPlan>> {
	const { ctx, progress, plan, landContext, commandStream, preMergeConfirmation } = options;
	const submitOutcome = await confirmAndSubmitRequiredPrUpdates({
		ctx,
		plan,
		landContext,
		progress,
		confirmation: preMergeConfirmation,
	});
	if (submitOutcome.type === "failure") return submitOutcome;

	commandStream.note("Rechecking landing preflight...");
	progress.setStatus("rechecking preflight...");
	// Intentionally omit the preloaded shape: submit may have changed refs and PR metadata.
	const rechecked = await buildStackLandingPlan(landContext, ctx.cwd, {
		shouldAllowSubmitRequiredState: true,
		landingBranchLimit: plan.stack.landingBranches.length,
	});
	if (rechecked.type === "failure") return failure(rechecked.failure);

	commandStream.matrix?.setRows(landMatrixRowsFromPlan(rechecked.value));
	const residualFailure = residualPreMergeFailure(rechecked.value);
	if (residualFailure) return failure(residualFailure);
	return success(rechecked.value);
}

async function confirmMainLanding(options: {
	readonly session: LandingSession;
	readonly shouldPrompt: boolean;
	readonly title: string;
	readonly details: string;
	readonly nonInteractiveMessage: string;
	readonly cancellationMessage?: string;
}): Promise<LandStackOutcome> {
	return await confirmLandStackAction({
		ctx: options.session.ctx,
		shouldPrompt: options.shouldPrompt,
		title: options.title,
		details: options.details,
		nonInteractiveMessage: options.nonInteractiveMessage,
		...optionalEntry("cancellationMessage", options.cancellationMessage),
		onFailure: (landFailure) => {
			presentLandStackFailure({ session: options.session, failure: landFailure });
		},
	});
}

function formatPreparingLandingMilestone(plan: LandingPlan): string {
	return `Preparing to land ${plan.stack.landingBranches.length} PR${plan.stack.landingBranches.length === 1 ? "" : "s"} through ${plan.stack.landingTargetBranch}...`;
}

export function presentLandStackFailure(options: {
	readonly session: LandingSession;
	readonly failure: LandFlowFailure;
}): void {
	const { ctx, commandStream, landed } = options.session;
	const formatted = formatFailure(options.failure, landed);
	commandStream.finishFailure(formatted);
	presentBrief({
		ctx,
		fullMessage: formatted,
		level: failureLevel(options.failure),
		uiMessage: formatFailureNotification(options.failure),
		kind: landFailureKind(options.failure),
	});
}

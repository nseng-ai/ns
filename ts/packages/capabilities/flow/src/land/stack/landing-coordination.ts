import { LandStackCommandStream } from "./command-stream.ts";
import {
	failure,
	success,
	type LandFlowFailure,
	type LandStackOutcome,
	type LandStackResult,
} from "./errors.ts";
import { buildLandingPlan } from "./landing-plan.ts";
import { confirmAndFreeManagedSlots, residualPreMergeFailure } from "./landing-operations.ts";
import {
	confirmLandStackAction,
	optionalField,
	type PreMergeConfirmation,
} from "./pre-merge-confirmation.ts";
import { confirmAndSubmitRequiredPrUpdates } from "./pre-merge-submit.ts";
import {
	failureLevel,
	formatFailure,
	formatFailureNotification,
	landFailureKind,
	presentBrief,
	setStatus,
} from "../land-presentation.ts";
import { landMatrixRowsFromPlan } from "../land-matrix-progress.ts";
import type { StackLandingRuntime } from "./stack-landing-runtime.ts";
import type { LandContext } from "../api.ts";
import type { LandingPlan } from "../types.ts";
import type { LandStackCommandContext, LandedPr } from "./types.ts";

export interface LandingSession {
	ctx: LandStackCommandContext;
	commandStream: LandStackCommandStream;
	landed: LandedPr[];
}

interface PreparePlanForMergeOptions {
	runtime: StackLandingRuntime;
	session: LandingSession;
	plan: LandingPlan;
	preMergeConfirmation?: PreMergeConfirmation;
}

export async function preparePlanForMerge(
	options: PreparePlanForMergeOptions,
): Promise<LandStackResult<LandingPlan>> {
	const result = await preparePlanForMergeCore(options);
	if (result.type === "failure") {
		presentLandStackFailure({
			session: options.session,
			failure: result.failure,
		});
	}
	return result;
}

async function preparePlanForMergeCore(
	options: PreparePlanForMergeOptions,
): Promise<LandStackResult<LandingPlan>> {
	const { runtime, plan } = options;
	const { ctx, commandStream } = options.session;
	const landContext = runtime.landContext;
	const preMergeConfirmation = options.preMergeConfirmation ?? "prompt";

	if (plan.managedSlotConflicts.length === 0 && plan.prSubmitRequirements.length === 0) {
		return success(plan);
	}

	if (plan.managedSlotConflicts.length > 0) {
		const slotOutcome = await confirmAndFreeManagedSlots({
			runtime,
			ctx,
			plan,
			confirmation: preMergeConfirmation,
		});
		if (slotOutcome.type === "failure") return slotOutcome;
	}

	if (plan.prSubmitRequirements.length > 0) {
		return await submitRequiredUpdatesAndRecheckPlan({
			ctx,
			plan,
			landContext,
			commandStream,
			preMergeConfirmation,
		});
	}

	return success(plan);
}

interface SubmitRequiredUpdatesAndRecheckPlanOptions {
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	landContext: LandContext;
	commandStream: LandStackCommandStream;
	preMergeConfirmation: PreMergeConfirmation;
}

async function submitRequiredUpdatesAndRecheckPlan(
	options: SubmitRequiredUpdatesAndRecheckPlanOptions,
): Promise<LandStackResult<LandingPlan>> {
	const { ctx, plan, landContext, commandStream, preMergeConfirmation } = options;
	const submitOutcome = await confirmAndSubmitRequiredPrUpdates({
		ctx,
		plan,
		landContext,
		confirmation: preMergeConfirmation,
	});
	if (submitOutcome.type === "failure") return submitOutcome;

	commandStream.note("Rechecking landing preflight...");
	setStatus(ctx, "rechecking preflight...");
	const rechecked = await buildLandingPlan(landContext, ctx.cwd, {
		shouldAllowSubmitRequiredState: true,
		landingBranchLimit: plan.stack.landingBranches.length,
	});
	if (rechecked.type === "failure") return rechecked;

	commandStream.matrix?.setRows(landMatrixRowsFromPlan(rechecked.value));
	const residualFailure = residualPreMergeFailure(rechecked.value);
	if (residualFailure) return failure(residualFailure);
	return rechecked;
}

interface ConfirmMainLandingOptions {
	session: LandingSession;
	shouldPrompt: boolean;
	title: string;
	details: string;
	nonInteractiveMessage: string;
	cancellationMessage?: string;
}

export async function confirmMainLanding(
	options: ConfirmMainLandingOptions,
): Promise<LandStackOutcome> {
	const { ctx } = options.session;
	return await confirmLandStackAction({
		ctx,
		shouldPrompt: options.shouldPrompt,
		title: options.title,
		details: options.details,
		nonInteractiveMessage: options.nonInteractiveMessage,
		...optionalField("cancellationMessage", options.cancellationMessage),
		onFailure: (landFailure) => {
			presentLandStackFailure({
				session: options.session,
				failure: landFailure,
			});
		},
	});
}

export function formatPreparingLandingMilestone(plan: LandingPlan): string {
	return `Preparing to land ${plan.stack.landingBranches.length} PR${plan.stack.landingBranches.length === 1 ? "" : "s"} through ${plan.stack.landingTargetBranch}...`;
}

interface PresentLandStackFailureOptions {
	session: LandingSession;
	failure: LandFlowFailure;
}

export function presentLandStackFailure(options: PresentLandStackFailureOptions): void {
	const { ctx, commandStream, landed } = options.session;
	const { failure } = options;
	const formatted = formatFailure(failure, landed);
	commandStream.finishFailure(formatted);
	presentBrief({
		ctx,
		fullMessage: formatted,
		level: failureLevel(failure),
		uiMessage: formatFailureNotification(failure),
		kind: landFailureKind(failure),
	});
}

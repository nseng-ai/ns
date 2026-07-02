import { LandStackCommandStream } from "./command-stream.ts";
import {
	failure,
	success,
	type LandStackFailure,
	type LandStackOutcome,
	type LandStackResult,
} from "./errors.ts";
import { buildLandingPlan } from "./landing-plan.ts";
import { createLandContext } from "./land-context-adapter.ts";
import { confirmAndFreeManagedSlots, residualPreMergeFailure } from "./landing-operations.ts";
import {
	confirmLandStackAction,
	optionalField,
	type PreMergeConfirmation,
} from "./pre-merge-confirmation.ts";
import { confirmAndSubmitRequiredPrUpdates } from "./pre-merge-submit.ts";
import {
	formatFailure,
	formatFailureNotification,
	landFailureKind,
	presentBrief,
	setStatus,
} from "./presentation.ts";
import type { LandRuntime } from "./land-runtime.ts";
import type { LandStackCommandContext, LandedPr, LandingPlan } from "./types.ts";

export interface LandingSession {
	ctx: LandStackCommandContext;
	commandStream: LandStackCommandStream;
	landed: LandedPr[];
}

interface PreparePlanForMergeOptions {
	runtime: LandRuntime;
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
	const preMergeConfirmation = options.preMergeConfirmation ?? "prompt";
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
			runtime,
			ctx,
			plan,
			commandStream,
			preMergeConfirmation,
		});
	}

	return success(plan);
}

interface SubmitRequiredUpdatesAndRecheckPlanOptions {
	runtime: LandRuntime;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	commandStream: LandStackCommandStream;
	preMergeConfirmation: PreMergeConfirmation;
}

async function submitRequiredUpdatesAndRecheckPlan(
	options: SubmitRequiredUpdatesAndRecheckPlanOptions,
): Promise<LandStackResult<LandingPlan>> {
	const { runtime, ctx, plan, commandStream, preMergeConfirmation } = options;
	const landContext = createLandContext(runtime.commands, { graphite: runtime.graphite });
	const submitOutcome = await confirmAndSubmitRequiredPrUpdates({
		runtime,
		ctx,
		plan,
		landContext,
		confirmation: preMergeConfirmation,
	});
	if (submitOutcome.type === "failure") return submitOutcome;

	commandStream.note("Rechecking landing preflight...");
	setStatus(ctx, "rechecking preflight...");
	const rechecked = await buildLandingPlan(runtime, ctx.cwd, {
		shouldAllowSubmitRequiredState: true,
		landingBranchLimit: plan.stack.landingBranches.length,
	});
	if (rechecked.type === "failure") return rechecked;

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
	failure: LandStackFailure;
}

export function presentLandStackFailure(options: PresentLandStackFailureOptions): void {
	const { ctx, commandStream, landed } = options.session;
	const { failure } = options;
	const formatted = formatFailure(failure, landed);
	commandStream.finishFailure(formatted);
	presentBrief({
		ctx,
		fullMessage: formatted,
		level: failure.level,
		uiMessage: formatFailureNotification(failure),
		kind: landFailureKind(failure),
	});
}

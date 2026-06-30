import { LandStackCommandStream } from "./command-stream.ts";
import { failure, success, type LandStackFailure, type LandStackResult } from "./errors.ts";
import { buildLandingPlan } from "./landing-plan.ts";
import {
	confirmAndFreeManagedSlots,
	confirmAndSubmitRequiredPrUpdates,
	residualPreMergeFailure,
	type PreMergeConfirmation,
} from "./landing-operations.ts";
import {
	formatFailure,
	formatFailureNotification,
	landFailureKind,
	presentBrief,
	setStatus,
} from "./presentation.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandedChunk,
	LandedPr,
	LandingPlan,
} from "./types.ts";

interface PreparePlanForMergeOptions {
	runtimePi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	landed: readonly LandedPr[];
	landedChunks: readonly LandedChunk[];
	commandStream: LandStackCommandStream;
	preMergeConfirmation?: PreMergeConfirmation;
}

export async function preparePlanForMerge(
	options: PreparePlanForMergeOptions,
): Promise<LandStackResult<LandingPlan>> {
	const { runtimePi, ctx, plan, landed, landedChunks, commandStream } = options;
	const preMergeConfirmation = options.preMergeConfirmation ?? "prompt";
	if (plan.managedSlotConflicts.length > 0) {
		const slotOutcome = await confirmAndFreeManagedSlots({
			pi: runtimePi,
			ctx,
			plan,
			confirmation: preMergeConfirmation,
		});
		if (slotOutcome.type === "failure") {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: slotOutcome.failure,
			});
			return slotOutcome;
		}
	}

	if (plan.prSubmitRequirements.length > 0) {
		const submitOutcome = await confirmAndSubmitRequiredPrUpdates({
			pi: runtimePi,
			ctx,
			plan,
			confirmation: preMergeConfirmation,
		});
		if (submitOutcome.type === "failure") {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: submitOutcome.failure,
			});
			return submitOutcome;
		}
		commandStream.note("Rechecking landing preflight...");
		setStatus(ctx, "rechecking preflight...");
		const rechecked = await buildLandingPlan(runtimePi, ctx.cwd, {
			allowSubmitRequiredState: true,
			landingBranchLimit: plan.stack.landingBranches.length,
		});
		if (rechecked.type === "failure") {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: rechecked.failure,
			});
			return rechecked;
		}
		const residualFailure = residualPreMergeFailure(rechecked.value);
		if (residualFailure) {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: residualFailure,
			});
			return failure(residualFailure);
		}
		return rechecked;
	}

	return success(plan);
}

export function formatPreparingLandingMilestone(plan: LandingPlan): string {
	return `Preparing to land ${plan.stack.landingBranches.length} PR${plan.stack.landingBranches.length === 1 ? "" : "s"} through ${plan.stack.landingTargetBranch}...`;
}

interface PresentLandStackFailureOptions {
	ctx: LandStackCommandContext;
	commandStream: LandStackCommandStream;
	landed: readonly LandedPr[];
	landedChunks: readonly LandedChunk[];
	failure: LandStackFailure;
}

export function presentLandStackFailure(options: PresentLandStackFailureOptions): void {
	const { ctx, commandStream, landed, landedChunks, failure } = options;
	const formatted = formatFailure(failure, landed, landedChunks);
	commandStream.finishFailure(formatted);
	presentBrief({
		ctx,
		fullMessage: formatted,
		level: failure.level,
		uiMessage: formatFailureNotification(failure),
		kind: landFailureKind(failure),
	});
}

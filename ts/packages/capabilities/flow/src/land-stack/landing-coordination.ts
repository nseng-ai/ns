import { LandStackCommandStream } from "./command-stream.ts";
import {
	completed,
	failure,
	landStackFailure,
	success,
	type LandStackFailure,
	type LandStackOutcome,
	type LandStackResult,
} from "./errors.ts";
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
	const result = await preparePlanForMergeCore(options);
	if (result.type === "failure") {
		presentLandStackFailure({
			ctx: options.ctx,
			commandStream: options.commandStream,
			landed: options.landed,
			landedChunks: options.landedChunks,
			failure: result.failure,
		});
	}
	return result;
}

async function preparePlanForMergeCore(
	options: PreparePlanForMergeOptions,
): Promise<LandStackResult<LandingPlan>> {
	const { runtimePi, ctx, plan, commandStream } = options;
	const preMergeConfirmation = options.preMergeConfirmation ?? "prompt";
	if (plan.managedSlotConflicts.length > 0) {
		const slotOutcome = await confirmAndFreeManagedSlots({
			pi: runtimePi,
			ctx,
			plan,
			confirmation: preMergeConfirmation,
		});
		if (slotOutcome.type === "failure") return slotOutcome;
	}

	if (plan.prSubmitRequirements.length > 0) {
		return await submitRequiredUpdatesAndRecheckPlan({
			runtimePi,
			ctx,
			plan,
			commandStream,
			preMergeConfirmation,
		});
	}

	return success(plan);
}

interface SubmitRequiredUpdatesAndRecheckPlanOptions {
	runtimePi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	commandStream: LandStackCommandStream;
	preMergeConfirmation: PreMergeConfirmation;
}

async function submitRequiredUpdatesAndRecheckPlan(
	options: SubmitRequiredUpdatesAndRecheckPlanOptions,
): Promise<LandStackResult<LandingPlan>> {
	const { runtimePi, ctx, plan, commandStream, preMergeConfirmation } = options;
	const submitOutcome = await confirmAndSubmitRequiredPrUpdates({
		pi: runtimePi,
		ctx,
		plan,
		confirmation: preMergeConfirmation,
	});
	if (submitOutcome.type === "failure") return submitOutcome;

	commandStream.note("Rechecking landing preflight...");
	setStatus(ctx, "rechecking preflight...");
	const rechecked = await buildLandingPlan(runtimePi, ctx.cwd, {
		allowSubmitRequiredState: true,
		landingBranchLimit: plan.stack.landingBranches.length,
	});
	if (rechecked.type === "failure") return rechecked;

	const residualFailure = residualPreMergeFailure(rechecked.value);
	if (residualFailure) return failure(residualFailure);
	return rechecked;
}

interface ConfirmMainLandingOptions {
	ctx: LandStackCommandContext;
	commandStream: LandStackCommandStream;
	landed: readonly LandedPr[];
	landedChunks: readonly LandedChunk[];
	shouldPrompt: boolean;
	title: string;
	details: string;
	nonInteractiveMessage: string;
	cancellationMessage?: string;
}

export async function confirmMainLanding(
	options: ConfirmMainLandingOptions,
): Promise<LandStackOutcome> {
	if (!options.shouldPrompt) return completed();
	if (!options.ctx.hasUI) {
		const landFailure = landStackFailure(options.nonInteractiveMessage, { outcome: "refusal" });
		presentLandStackFailure({
			ctx: options.ctx,
			commandStream: options.commandStream,
			landed: options.landed,
			landedChunks: options.landedChunks,
			failure: landFailure,
		});
		return failure(landFailure);
	}
	const confirmed = await options.ctx.ui.confirm(options.title, options.details);
	if (confirmed) return completed();
	const landFailure = landStackFailure(
		options.cancellationMessage ?? "Cancelled before merge; no PRs were landed.",
		{
			level: "info",
			outcome: "refusal",
		},
	);
	presentLandStackFailure({
		ctx: options.ctx,
		commandStream: options.commandStream,
		landed: options.landed,
		landedChunks: options.landedChunks,
		failure: landFailure,
	});
	return failure(landFailure);
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

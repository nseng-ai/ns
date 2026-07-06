import { LandStackCommandStream } from "./command-stream.ts";
import {
	failure,
	success,
	type LandStackFailure,
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
	formatFailure,
	formatFailureNotification,
	landFailureKind,
	presentBrief,
	setStatus,
} from "./presentation.ts";
import { createRuntimeLandContext, type LandRuntime } from "./land-runtime.ts";
import type { LandStackCommandContext, LandedPr, FlowLandingPlan } from "./types.ts";
import { landMatrixRowsFromPlan } from "../land-matrix-progress.ts";

export interface LandingSession {
	ctx: LandStackCommandContext;
	commandStream: LandStackCommandStream;
	landed: LandedPr[];
}

interface PreparePlanForMergeOptions {
	runtime: LandRuntime;
	session: LandingSession;
	plan: FlowLandingPlan;
	preMergeConfirmation?: PreMergeConfirmation;
}

export async function preparePlanForMerge(
	options: PreparePlanForMergeOptions,
): Promise<LandStackResult<FlowLandingPlan>> {
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
): Promise<LandStackResult<FlowLandingPlan>> {
	const { runtime, plan } = options;
	const { ctx, commandStream } = options.session;
	const preMergeConfirmation = options.preMergeConfirmation ?? "prompt";
	let landContext: ReturnType<typeof createRuntimeLandContext> | undefined;
	const getLandContext = (): ReturnType<typeof createRuntimeLandContext> => {
		landContext ??= createRuntimeLandContext(runtime);
		return landContext;
	};

	if (plan.managedSlotConflicts.length === 0 && plan.prSubmitRequirements.length === 0) {
		commandStream.matrix?.setGlobal("prepare", { state: "skipped", text: "not required" });
		return success(plan);
	}

	commandStream.matrix?.setGlobal("prepare", {
		state: "active",
		text: "preparing stack for merge…",
	});

	if (plan.managedSlotConflicts.length > 0) {
		commandStream.matrix?.setGlobalSubstep("prepare", "slots", { state: "active" });
		const slotOutcome = await confirmAndFreeManagedSlots({
			runtime,
			ctx,
			plan,
			landContext: getLandContext(),
			confirmation: preMergeConfirmation,
		});
		if (slotOutcome.type === "failure") {
			commandStream.matrix?.setGlobalSubstep("prepare", "slots", { state: "failed" });
			commandStream.matrix?.setGlobal("prepare", { state: "failed", text: "slot cleanup failed" });
			return slotOutcome;
		}
		commandStream.matrix?.setGlobalSubstep("prepare", "slots", { state: "done" });
	} else {
		commandStream.matrix?.setGlobalSubstep("prepare", "slots", {
			state: "skipped",
			text: "not required",
		});
	}

	if (plan.prSubmitRequirements.length > 0) {
		return await submitRequiredUpdatesAndRecheckPlan({
			runtime,
			ctx,
			plan,
			landContext: getLandContext(),
			commandStream,
			preMergeConfirmation,
		});
	}

	commandStream.matrix?.setGlobalSubstep("prepare", "update", {
		state: "skipped",
		text: "not required",
	});
	commandStream.matrix?.setGlobalSubstep("prepare", "recheck", {
		state: "skipped",
		text: "not required",
	});
	commandStream.matrix?.setGlobal("prepare", { state: "done", text: "ready to merge" });
	return success(plan);
}

interface SubmitRequiredUpdatesAndRecheckPlanOptions {
	runtime: LandRuntime;
	ctx: LandStackCommandContext;
	plan: FlowLandingPlan;
	landContext: ReturnType<typeof createRuntimeLandContext>;
	commandStream: LandStackCommandStream;
	preMergeConfirmation: PreMergeConfirmation;
}

async function submitRequiredUpdatesAndRecheckPlan(
	options: SubmitRequiredUpdatesAndRecheckPlanOptions,
): Promise<LandStackResult<FlowLandingPlan>> {
	const { runtime, ctx, plan, landContext, commandStream, preMergeConfirmation } = options;
	commandStream.matrix?.setGlobalSubstep("prepare", "update", { state: "active" });
	const submitOutcome = await confirmAndSubmitRequiredPrUpdates({
		ctx,
		plan,
		landContext,
		confirmation: preMergeConfirmation,
	});
	if (submitOutcome.type === "failure") {
		commandStream.matrix?.setGlobalSubstep("prepare", "update", { state: "failed" });
		commandStream.matrix?.setGlobal("prepare", { state: "failed", text: "PR update failed" });
		return submitOutcome;
	}
	commandStream.matrix?.setGlobalSubstep("prepare", "update", { state: "done" });

	commandStream.note("Rechecking landing preflight...");
	commandStream.matrix?.setGlobalSubstep("prepare", "recheck", { state: "active" });
	setStatus(ctx, "rechecking preflight...");
	const rechecked = await buildLandingPlan(runtime, ctx.cwd, {
		shouldAllowSubmitRequiredState: true,
		landingBranchLimit: plan.stack.landingBranches.length,
	});
	if (rechecked.type === "failure") {
		commandStream.matrix?.setGlobalSubstep("prepare", "recheck", { state: "failed" });
		commandStream.matrix?.setGlobal("prepare", { state: "failed", text: "recheck failed" });
		return rechecked;
	}

	commandStream.matrix?.setRows(landMatrixRowsFromPlan(rechecked.value));
	commandStream.matrix?.setGlobalSubstep("prepare", "recheck", { state: "done" });
	const residualFailure = residualPreMergeFailure(rechecked.value);
	if (residualFailure) {
		commandStream.matrix?.setGlobal("prepare", {
			state: "failed",
			text: "pre-merge requirements remain",
		});
		return failure(residualFailure);
	}
	commandStream.matrix?.setGlobal("prepare", { state: "done", text: "ready to merge" });
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

export function formatPreparingLandingMilestone(plan: FlowLandingPlan): string {
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

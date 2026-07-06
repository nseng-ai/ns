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
import {
	runTrackedMatrixStep,
	type MatrixCellUpdate,
} from "../../phase-stream/matrix-progress-core.ts";

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

interface WithPrepareSubstepOptions<T> {
	commandStream: LandStackCommandStream;
	substep: string;
	failureUpdate: MatrixCellUpdate;
	op: () => Promise<LandStackResult<T>>;
}

async function withPrepareSubstep<T>(
	options: WithPrepareSubstepOptions<T>,
): Promise<LandStackResult<T>> {
	return await runTrackedMatrixStep({
		onActive: () => {
			options.commandStream.matrix?.setGlobalSubstep("prepare", options.substep, {
				state: "active",
			});
		},
		onDone: () => {
			options.commandStream.matrix?.setGlobalSubstep("prepare", options.substep, { state: "done" });
		},
		onFailed: () => {
			options.commandStream.matrix?.setGlobalSubstep("prepare", options.substep, {
				state: "failed",
			});
			options.commandStream.matrix?.setGlobal("prepare", options.failureUpdate);
		},
		op: options.op,
	});
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
		const slotOutcome = await withPrepareSubstep({
			commandStream,
			substep: "slots",
			failureUpdate: { state: "failed", text: "slot cleanup failed" },
			op: async () =>
				await confirmAndFreeManagedSlots({
					runtime,
					ctx,
					plan,
					landContext: getLandContext(),
					confirmation: preMergeConfirmation,
				}),
		});
		if (slotOutcome.type === "failure") return slotOutcome;
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
	const submitOutcome = await withPrepareSubstep({
		commandStream,
		substep: "update",
		failureUpdate: { state: "failed", text: "PR update failed" },
		op: async () =>
			await confirmAndSubmitRequiredPrUpdates({
				ctx,
				plan,
				landContext,
				confirmation: preMergeConfirmation,
			}),
	});
	if (submitOutcome.type === "failure") return submitOutcome;

	commandStream.note("Rechecking landing preflight...");
	setStatus(ctx, "rechecking preflight...");
	const rechecked = await withPrepareSubstep({
		commandStream,
		substep: "recheck",
		failureUpdate: { state: "failed", text: "recheck failed" },
		op: async () =>
			await buildLandingPlan(runtime, ctx.cwd, {
				shouldAllowSubmitRequiredState: true,
				landingBranchLimit: plan.stack.landingBranches.length,
			}),
	});
	if (rechecked.type === "failure") return rechecked;

	commandStream.matrix?.setRows(landMatrixRowsFromPlan(rechecked.value));
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

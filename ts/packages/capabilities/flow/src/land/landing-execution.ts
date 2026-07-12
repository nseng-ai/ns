import type { LandExecutionProgress } from "./execution/host-seams.ts";
import { executeStackLandingPlan } from "./execution/execute.ts";
import { landMatrixRowsFromPlan, type LandMatrixProgressSink } from "./land-matrix-progress.ts";
import {
	buildLandFailurePresentation,
	formatPlan,
	formatSuccessSummary,
	presentBrief,
	presentDryRunLanding,
	presentLandingSuccess,
} from "./land-presentation.ts";
import type { LandedPullRequest, LandingPlan } from "./types.ts";
import { LandStackCommandStream } from "./stack/command-stream.ts";
import { landCompleted, landOutcomeFailure, type LandOutcome } from "./results.ts";
import type { PreMergeConfirmation } from "./stack/pre-merge-confirmation.ts";
import { createFlowLandConfirmationGateway } from "./post-landing-slot-cleanup.ts";
import type { StackLandingRuntime } from "./stack/stack-landing-runtime.ts";
import type { LandProgressReporter, LandStackCommandContext, ParsedArgs } from "./stack/types.ts";

export function createFlowLandExecutionProgress(options: {
	readonly commandStream: Pick<LandStackCommandStream, "emitLiveProgress" | "note">;
	readonly progress: LandProgressReporter;
	readonly matrix?: LandMatrixProgressSink;
}): LandExecutionProgress {
	return {
		note: (message) => options.commandStream.note(message),
		setStatus: (message) => options.progress.setStatus(message),
		setStep: (branch, step, state) => options.matrix?.setCell(branch, step, { state }),
		recordMergedPullRequest: (pullRequest) => {
			options.commandStream.emitLiveProgress({
				prNumber: pullRequest.number,
				branch: pullRequest.branch,
			});
		},
		planRecalculated: (plan) => options.matrix?.setRows(landMatrixRowsFromPlan(plan)),
	};
}

export interface LandingSession {
	readonly ctx: LandStackCommandContext;
	readonly commandStream: LandStackCommandStream;
	readonly progress: LandExecutionProgress;
}

export interface RunFlowStackLandingOptions {
	readonly runtime: StackLandingRuntime;
	readonly parsedArgs: ParsedArgs;
	readonly options: {
		readonly shouldSkipMainConfirmation?: boolean;
		readonly preMergeConfirmation?: PreMergeConfirmation;
	};
	readonly session: LandingSession;
	readonly plan: LandingPlan;
}

export async function runFlowStackLanding(
	executionOptions: RunFlowStackLandingOptions,
): Promise<LandOutcome> {
	const { runtime, parsedArgs, options, session, plan } = executionOptions;
	const { ctx, commandStream, progress } = session;
	const planText = formatPlan(plan);

	if (parsedArgs.isDryRun) {
		presentDryRunLanding({ ctx, commandStream, planText });
		return landCompleted();
	}

	const execution = await executeStackLandingPlan(
		runtime.landContext,
		{ confirmation: createFlowLandConfirmationGateway(ctx), progress },
		plan,
		{
			cwd: ctx.cwd,
			mainConfirmationAlreadyApproved:
				parsedArgs.shouldSkipConfirmation || Boolean(options.shouldSkipMainConfirmation),
			preMergeConfirmationAlreadyApproved: options.preMergeConfirmation === "already-approved",
			warnings: [],
		},
	);
	if (execution.type === "failure") {
		presentLandStackFailure({
			session,
			failure: execution.failure,
			landed: execution.landed,
		});
		return landOutcomeFailure(execution.failure);
	}

	const successSummary = formatSuccessSummary(
		[...execution.value.landed],
		execution.value.plan.descendantMaintenance,
		[...execution.value.warnings],
		{ retainedLocalBranches: [...execution.value.cleanup.retainedLocalBranches] },
	);
	presentLandingSuccess({
		ctx,
		commandStream,
		landed: execution.value.landed,
		warnings: execution.value.warnings,
		successSummary,
	});
	return landCompleted();
}

export function presentLandStackFailure(options: {
	readonly session: LandingSession;
	readonly failure: Parameters<typeof buildLandFailurePresentation>[0];
	readonly landed?: readonly LandedPullRequest[];
}): void {
	const { ctx, commandStream } = options.session;
	const presentation = buildLandFailurePresentation(options.failure, options.landed ?? []);
	commandStream.finishFailure(presentation.fullMessage);
	presentBrief({ ctx, ...presentation });
}

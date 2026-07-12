import type { LandExecutionProgress } from "./execution/host-seams.ts";
import { executeLanding } from "./api.ts";
import type { StackLandingShape } from "./preflight.ts";
import { landMatrixRowsFromPlan, type LandMatrixProgressSink } from "./land-matrix-progress.ts";
import {
	buildLandFailurePresentation,
	formatPlan,
	formatPostLandingCleanupSuccessNotice,
	formatSuccessSummary,
	notifyPrintAware,
	presentBrief,
	presentDryRunLanding,
	presentFailureAndReturn,
	presentLandingSuccess,
} from "./land-presentation.ts";
import type {
	LandedPullRequest,
	LandingExecutionApprovals,
	LandingExecutionReport,
	LandingRequest,
} from "./types.ts";
import { LandStackCommandStream } from "./stack/command-stream.ts";
import { landCompleted, landOutcomeFailure, type LandOutcome } from "./results.ts";
import type { PreMergeConfirmation } from "./stack/pre-merge-confirmation.ts";
import { createFlowLandConfirmationGateway } from "./flow-land-confirmation-gateway.ts";
import { landingCleanupPolicyFromArgs } from "./post-landing-slot-cleanup.ts";
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
		readonly isPostLandingCleanupApproved?: boolean;
	};
	readonly session: LandingSession;
	readonly shape?: StackLandingShape;
}

export async function runFlowStackLanding(
	executionOptions: RunFlowStackLandingOptions,
): Promise<LandOutcome> {
	const { runtime, parsedArgs, options, session } = executionOptions;
	const { ctx, commandStream } = session;

	const request: LandingRequest = {
		cwd: ctx.cwd,
		target: { type: "stack" },
		mode: parsedArgs.isDryRun ? "dry-run" : "execute",
		preflight: { shouldAllowSubmitRequiredState: true },
		cleanup: landingCleanupPolicyFromArgs(parsedArgs),
	};
	const approvals: LandingExecutionApprovals = {
		isMainConfirmationAlreadyApproved:
			parsedArgs.shouldSkipConfirmation || Boolean(options.shouldSkipMainConfirmation),
		isPreMergeConfirmationAlreadyApproved: options.preMergeConfirmation === "already-approved",
		isPostLandingCleanupAlreadyApproved:
			parsedArgs.shouldSkipConfirmation || Boolean(options.isPostLandingCleanupApproved),
	};

	const execution = await executeLanding(
		runtime.landContext,
		request,
		{ confirmation: createFlowLandConfirmationGateway(ctx), progress: session.progress },
		{
			approvals,
			...(executionOptions.shape === undefined ? {} : { preparedShape: executionOptions.shape }),
		},
	);
	const report = execution.report;

	if (execution.type === "failed") {
		if (didLandBeforePostLandingCleanupFailure(report)) {
			// PRs landed; preserve the legacy output order of success summary then cleanup failure.
			presentStackLandingSuccess(session, report);
			presentFailureAndReturn(ctx, execution.failure);
			return landOutcomeFailure(execution.failure);
		}
		presentLandStackFailure({
			session,
			failure: execution.failure,
			landed: landedFromReport(report),
		});
		return landOutcomeFailure(execution.failure);
	}

	if (parsedArgs.isDryRun) {
		const planText = report.plan === undefined ? "" : formatPlan(report.plan);
		presentDryRunLanding({ ctx, commandStream, planText });
		return landCompleted();
	}

	presentStackLandingSuccess(session, report);
	const postCleanup = report.cleanup.postLandingSlotCleanup;
	if (postCleanup.type === "completed") {
		notifyPrintAware({
			ctx,
			message: formatPostLandingCleanupSuccessNotice(postCleanup),
			level: "success",
			kind: "success",
		});
	}
	return landCompleted();
}

function landedFromReport(report: LandingExecutionReport): readonly LandedPullRequest[] {
	return report.landedChunks.flatMap((chunk) => [...chunk.landed]);
}

function didLandBeforePostLandingCleanupFailure(report: LandingExecutionReport): boolean {
	return (
		report.phases.some((phase) => phase.type === "completed" && phase.phase === "merge") &&
		report.phases.some((phase) => phase.type === "failed" && phase.phase === "post-landing-cleanup")
	);
}

function presentStackLandingSuccess(session: LandingSession, report: LandingExecutionReport): void {
	const landed = landedFromReport(report);
	const successSummary = formatSuccessSummary(
		[...landed],
		report.plan?.descendantMaintenance ?? { type: "none", branches: [] },
		[...report.warnings],
		{
			retainedLocalBranches: [...report.cleanup.mergeMaintenanceCleanup.retainedLocalBranches],
		},
	);
	presentLandingSuccess({
		ctx: session.ctx,
		commandStream: session.commandStream,
		landed,
		warnings: report.warnings,
		successSummary,
	});
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

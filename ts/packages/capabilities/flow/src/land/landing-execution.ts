import type { LandConfirmationRequest, LandExecutionProgress } from "./execution/host-seams.ts";
import { executeLanding, type LandingExecutionSource } from "./api.ts";
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
	LandingExecutionReport,
	LandingExecutionResult,
	LandingRequest,
	PostLandingSlotCleanupReport,
} from "./types.ts";
import { LandStackCommandStream } from "./stack/command-stream.ts";
import { landCompleted, landOutcomeFailure, type LandOutcome } from "./results.ts";
import {
	createFlowLandConfirmationGateway,
	createUpfrontApprovedLandConfirmationGateway,
} from "./flow-land-confirmation-gateway.ts";
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

export interface FlowLandingExecutionInput {
	readonly source: LandingExecutionSource;
	readonly approvedConfirmationKinds: ReadonlySet<LandConfirmationRequest["kind"]>;
}

export interface RunFlowStackLandingOptions {
	readonly runtime: Pick<StackLandingRuntime, "landContext">;
	readonly parsedArgs: ParsedArgs;
	readonly execution: FlowLandingExecutionInput;
	readonly session: LandingSession;
}

export async function runFlowStackLanding(
	executionOptions: RunFlowStackLandingOptions,
): Promise<LandOutcome> {
	const { runtime, parsedArgs, execution, session } = executionOptions;
	const { ctx, commandStream } = session;

	const request: LandingRequest = {
		cwd: ctx.cwd,
		target: { type: "stack" },
		mode: parsedArgs.isDryRun ? "dry-run" : "execute",
		preflight: { shouldAllowSubmitRequiredState: true },
		cleanup: landingCleanupPolicyFromArgs(parsedArgs),
	};
	const outcome = await executeLanding({
		context: runtime.landContext,
		request,
		host: {
			confirmation: createUpfrontApprovedLandConfirmationGateway(
				createFlowLandConfirmationGateway(ctx),
				execution.approvedConfirmationKinds,
			),
			progress: session.progress,
		},
		source: execution.source,
	});
	const report = outcome.report;

	if (outcome.type === "failed") {
		return presentFlowStackLandingFailure({ session, outcome });
	}

	if (report.completionDisposition.type === "nothing-to-land") {
		const message = `Current branch is ${report.completionDisposition.currentBranch}, which is trunk or has no PR path to land. Nothing to do.`;
		presentBrief({
			ctx,
			fullMessage: message,
			level: "info",
			uiMessage: message,
			kind: "refusal",
		});
		return landCompleted();
	}

	if (report.completionDisposition.type === "cleanup-only") {
		presentCompletedPostLandingCleanup(ctx, report.cleanup.postLandingSlotCleanup);
		return landCompleted();
	}

	if (parsedArgs.isDryRun) {
		const planText = report.plan === undefined ? "" : formatPlan(report.plan);
		presentDryRunLanding({ ctx, commandStream, planText });
		return landCompleted();
	}

	presentStackLandingSuccess(session, report);
	presentCompletedPostLandingCleanup(ctx, report.cleanup.postLandingSlotCleanup);
	return landCompleted();
}

function presentCompletedPostLandingCleanup(
	ctx: LandStackCommandContext,
	report: PostLandingSlotCleanupReport,
): void {
	if (report.type !== "completed") return;
	notifyPrintAware({
		ctx,
		message: formatPostLandingCleanupSuccessNotice(report),
		level: "success",
		kind: "success",
	});
}

function landedFromReport(report: LandingExecutionReport): readonly LandedPullRequest[] {
	return report.landedChunks.flatMap((chunk) => [...chunk.landed]);
}

export function isPostLandingCleanupFailureAfterLanding(
	execution: Extract<LandingExecutionResult, { readonly type: "failed" }>,
): boolean {
	if (execution.failedPhase !== "post-landing-cleanup") return false;
	if (!execution.report.landedChunks.some((chunk) => chunk.landed.length > 0)) return false;

	const cleanup = execution.report.cleanup.postLandingSlotCleanup;
	return cleanup.type === "declined" || cleanup.type === "failed";
}

export function presentFlowStackLandingFailure(options: {
	readonly session: LandingSession;
	readonly outcome: Extract<LandingExecutionResult, { readonly type: "failed" }>;
}): LandOutcome {
	const { session, outcome } = options;
	if (isPostLandingCleanupFailureAfterLanding(outcome)) {
		// PRs landed; preserve the legacy output order of success summary then cleanup failure.
		presentStackLandingSuccess(session, outcome.report);
		presentFailureAndReturn(session.ctx, outcome.failure);
		return landOutcomeFailure(outcome.failure);
	}
	presentLandStackFailure({
		session,
		failure: outcome.failure,
		landed: landedFromReport(outcome.report),
	});
	return landOutcomeFailure(outcome.failure);
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

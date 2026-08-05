import type { LandConfirmationRequest, LandExecutionProgress } from "./execution/host-seams.ts";
import { executeLanding, type LandingExecutionSource } from "./api.ts";
import { landMatrixRowsFromPlan, type LandMatrixProgressSink } from "./land-matrix-progress.ts";
import { setStatus } from "./land-presentation.ts";
import type { LandingExecutionResult } from "./types.ts";
import { LandStackCommandStream } from "./stack/command-stream.ts";
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

/** Execute the canonical stack workflow and return its report unchanged. */
export async function runFlowStackLanding(
	executionOptions: RunFlowStackLandingOptions,
): Promise<LandingExecutionResult> {
	const { runtime, parsedArgs, execution, session } = executionOptions;
	const request = {
		cwd: session.ctx.cwd,
		target: { type: "stack" as const },
		mode: parsedArgs.isDryRun ? ("dry-run" as const) : ("execute" as const),
		preflight: { shouldAllowSubmitRequiredState: true },
		cleanup: landingCleanupPolicyFromArgs(parsedArgs),
		continuation: parsedArgs.shouldContinueUpstack
			? ({ type: "upstack" } as const)
			: ({ type: "none" } as const),
	};
	return await executeLanding({
		context: runtime.landContext,
		request,
		host: {
			confirmation: createUpfrontApprovedLandConfirmationGateway(
				createFlowLandConfirmationGateway(session.ctx),
				execution.approvedConfirmationKinds,
			),
			progress: session.progress,
		},
		source: execution.source,
	});
}

export function isPostLandingCleanupFailureAfterLanding(
	execution: Extract<LandingExecutionResult, { readonly type: "failed" }>,
): boolean {
	if (execution.failedPhase !== "post-landing-cleanup") return false;
	if (!execution.report.landedChunks.some((chunk) => chunk.landed.length > 0)) return false;
	return execution.report.cleanup.postLandingSlotCleanup.type === "failed";
}

export { setStatus };

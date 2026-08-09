import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { executeStackLanding } from "./land-stack.ts";
import type { FlowLandObservabilityChannels } from "./stack/command-stream.ts";
import type { StackLandingRuntime } from "./stack/stack-landing-runtime.ts";
import type { ParsedArgs, PrintAwareLandStackCommandContext } from "./stack/types.ts";
import { loadStackLandingShape } from "./api.ts";
import {
	isSingleBranchFastPath,
	runSingleBranchFastPathLanding,
} from "./single-branch-fast-path.ts";
import { approvedLandConfirmationKinds } from "./landing-confirmation-policy.ts";
import {
	postLandingCleanupRequestFromArgs,
	runPostLandingSlotCleanup,
} from "./post-landing-slot-cleanup.ts";
import type {
	LandingExecutionReport,
	LandingExecutionResult,
	LandingFailure,
	LandingPhase,
	LandingShape,
	PostLandingSlotCleanupReport,
	PullRequestFacts,
} from "./types.ts";

export type FlowLandWorkflowResult =
	| { readonly type: "stack"; readonly execution: LandingExecutionResult }
	| {
			readonly type: "single-branch-dry-run";
			readonly repoRoot: string;
			readonly pullRequest: PullRequestFacts;
	  }
	| {
			readonly type: "single-branch-landed";
			readonly repoRoot: string;
			readonly pullRequest: PullRequestFacts;
			readonly commandOutput: string;
			readonly cleanup: PostLandingSlotCleanupReport;
	  }
	| {
			readonly type: "failed";
			readonly failure: LandingFailure;
			readonly failedPhase: LandingPhase;
			readonly report?: LandingExecutionReport;
			readonly landedPullRequest?: PullRequestFacts;
	  };

interface RunLandingDispatchOptions {
	runtime: StackLandingRuntime;
	ctx: PrintAwareLandStackCommandContext;
	parsedArgs: ParsedArgs;
	observabilityChannels: FlowLandObservabilityChannels;
}

export async function runLandingDispatch(
	options: RunLandingDispatchOptions,
): Promise<FlowLandWorkflowResult> {
	const { runtime, observabilityChannels } = options;
	const shape = await loadStackLandingShape(runtime.landContext, options.ctx.cwd);
	if (shape.type === "failure") {
		return { type: "failed", failedPhase: failurePhase(shape.failure), failure: shape.failure };
	}

	const approvedConfirmationKinds = approvedLandConfirmationKinds({ flags: options.parsedArgs });
	if (isSingleBranchFastPath(shape.value.stack)) {
		return await runSingleBranchDispatch({
			options,
			shape: shape.value,
			approvedConfirmationKinds,
			...optionalEntry("progressIo", observabilityChannels.progressIo),
		});
	}

	return {
		type: "stack",
		execution: await executeStackLanding(runtime.source, options.ctx, options.parsedArgs, {
			graphite: runtime.graphite,
			observabilityChannels,
			execution: {
				source: { type: "prepared", shape: shape.value },
				approvedConfirmationKinds,
			},
		}),
	};
}

async function runSingleBranchDispatch(input: {
	readonly options: RunLandingDispatchOptions;
	readonly shape: LandingShape;
	readonly approvedConfirmationKinds: ReturnType<typeof approvedLandConfirmationKinds>;
	readonly progressIo?: NonNullable<FlowLandObservabilityChannels["progressIo"]>;
}): Promise<FlowLandWorkflowResult> {
	const fastPath = await runSingleBranchFastPathLanding({
		landContext: input.options.runtime.landContext,
		ctx: input.options.ctx,
		target: input.shape,
		isDryRun: input.options.parsedArgs.isDryRun,
		cleanup: postLandingCleanupRequestFromArgs(input.options.parsedArgs),
		approvedConfirmationKinds: input.approvedConfirmationKinds,
		...optionalEntry("progressIo", input.progressIo),
	});
	if (fastPath.outcome.type === "failure") {
		return {
			type: "failed",
			failedPhase: singleBranchFailurePhase(fastPath.outcome.stage),
			failure: fastPath.outcome.failure,
		};
	}
	if (fastPath.outcome.result === "dry-run") {
		return {
			type: "single-branch-dry-run",
			repoRoot: input.shape.repoRoot,
			pullRequest: fastPath.outcome.pullRequest,
		};
	}

	const cleanup = await runPostLandingSlotCleanup({
		landContext: input.options.runtime.landContext,
		ctx: input.options.ctx,
		args: input.options.parsedArgs,
		shape: input.shape,
		...optionalEntry("chosenCleanupPolicy", fastPath.chosenCleanupPolicy),
	});
	if (cleanup.type === "failure") {
		return {
			type: "failed",
			failedPhase: "post-landing-cleanup",
			failure: cleanup.failure,
			landedPullRequest: fastPath.outcome.pullRequest,
		};
	}
	return {
		type: "single-branch-landed",
		repoRoot: input.shape.repoRoot,
		pullRequest: fastPath.outcome.pullRequest,
		commandOutput: fastPath.outcome.commandOutput,
		cleanup: cleanup.cleanup,
	};
}

function failurePhase(failure: LandingFailure): LandingPhase {
	return failure.type === "execution" ? "request-validation" : failure.phase;
}

function singleBranchFailurePhase(
	stage: "load" | "base-check" | "confirmation" | "merge" | "verification",
): LandingPhase {
	switch (stage) {
		case "load":
		case "base-check":
			return "preflight";
		case "confirmation":
			return "confirmation";
		case "merge":
		case "verification":
			return "merge";
	}
}

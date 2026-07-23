import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { executeStackLanding } from "./land-stack.ts";
import type { FlowLandObservabilityChannels } from "./stack/command-stream.ts";
import type { StackLandingRuntime } from "./stack/stack-landing-runtime.ts";
import { landOutcomeFailure, type LandOutcome } from "./results.ts";
import { presentFailureAndReturn } from "./land-presentation.ts";
import type { ParsedArgs, PrintAwareLandStackCommandContext } from "./stack/types.ts";
import { loadStackLandingShape } from "./api.ts";
import {
	isSingleBranchFastPath,
	runSingleBranchFastPathLanding,
} from "./single-branch-fast-path.ts";
import { approvedLandConfirmationKinds } from "./landing-confirmation-policy.ts";
import {
	planPostLandingSlotCleanup,
	postLandingCleanupRequestFromArgs,
	runPostLandingSlotCleanup,
} from "./post-landing-slot-cleanup.ts";

interface RunLandingDispatchOptions {
	runtime: StackLandingRuntime;
	ctx: PrintAwareLandStackCommandContext;
	parsedArgs: ParsedArgs;
	observabilityChannels: FlowLandObservabilityChannels;
	hasSlotsExtension: boolean;
}

export async function runLandingDispatch(options: RunLandingDispatchOptions): Promise<LandOutcome> {
	const { runtime } = options;
	const { observabilityChannels } = options;
	const shape = await loadStackLandingShape(runtime.landContext, options.ctx.cwd);
	if (shape.type === "failure") {
		presentFailureAndReturn(options.ctx, shape.failure);
		return landOutcomeFailure(shape.failure);
	}

	const landContext = runtime.landContext;
	const cleanupPreview = planPostLandingSlotCleanup({
		args: options.parsedArgs,
		shape: shape.value,
		hasSlotsExtension: options.hasSlotsExtension,
	});
	const approvedConfirmationKinds = approvedLandConfirmationKinds({
		flags: options.parsedArgs,
		...optionalEntry("cleanupPreview", cleanupPreview),
	});
	if (isSingleBranchFastPath(shape.value.stack)) {
		const result = await runSingleBranchFastPathLanding({
			landContext,
			ctx: options.ctx,
			target: shape.value,
			isDryRun: options.parsedArgs.isDryRun,
			cleanup: postLandingCleanupRequestFromArgs(options.parsedArgs, options.hasSlotsExtension),
			approvedConfirmationKinds,
			...optionalEntry("progressIo", observabilityChannels.progressIo),
		});
		if (result.outcome.type === "failure") return result.outcome;
		return await runPostLandingSlotCleanup({
			landContext,
			ctx: options.ctx,
			args: options.parsedArgs,
			shape: shape.value,
			cleanupDecision: result.beforeMergeValue ?? { type: "not-needed" },
			hasSlotsExtension: options.hasSlotsExtension,
		});
	}

	return await executeStackLanding(runtime.source, options.ctx, options.parsedArgs, {
		hasSlotsExtension: options.hasSlotsExtension,
		graphite: runtime.graphite,
		observabilityChannels,
		execution: {
			source: { type: "prepared", shape: shape.value },
			approvedConfirmationKinds,
			hasSlotsExtension: options.hasSlotsExtension,
		},
	});
}

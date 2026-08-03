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
	postLandingCleanupRequestFromArgs,
	runPostLandingSlotCleanup,
} from "./post-landing-slot-cleanup.ts";

interface RunLandingDispatchOptions {
	runtime: StackLandingRuntime;
	ctx: PrintAwareLandStackCommandContext;
	parsedArgs: ParsedArgs;
	observabilityChannels: FlowLandObservabilityChannels;
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
	const approvedConfirmationKinds = approvedLandConfirmationKinds({
		flags: options.parsedArgs,
	});
	if (isSingleBranchFastPath(shape.value.stack) && !options.parsedArgs.shouldContinueUpstack) {
		const outcome = await runSingleBranchFastPathLanding({
			landContext,
			ctx: options.ctx,
			target: shape.value,
			isDryRun: options.parsedArgs.isDryRun,
			cleanup: postLandingCleanupRequestFromArgs(options.parsedArgs),
			approvedConfirmationKinds,
			...optionalEntry("progressIo", observabilityChannels.progressIo),
		});
		if (outcome.type === "failure") return outcome;
		return await runPostLandingSlotCleanup({
			landContext,
			ctx: options.ctx,
			args: options.parsedArgs,
			shape: shape.value,
		});
	}

	return await executeStackLanding(runtime.source, options.ctx, options.parsedArgs, {
		graphite: runtime.graphite,
		observabilityChannels,
		execution: {
			source: { type: "prepared", shape: shape.value },
			approvedConfirmationKinds,
		},
	});
}

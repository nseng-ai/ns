import { prepareCheckpointMessage } from "@nseng-ai/capability-kit/checkpoint-flow";
import type { NsExtensionApi, TextGenerationReasoning } from "@nseng-ai/sdk";

import { draftChangesSummary } from "../changes/changes-model-summary.ts";

export type FlowTextGenerationContext = Pick<NsExtensionApi, "env" | "textGenerator"> & {
	modelRef: string;
	reasoning?: TextGenerationReasoning;
};

export function prepareFlowChangesSummary(
	ctx: FlowTextGenerationContext,
	snapshot: { branch: string; status: string; diff: string },
) {
	return draftChangesSummary({
		textGenerator: ctx.textGenerator,
		modelRef: ctx.modelRef,
		...(ctx.reasoning === undefined ? {} : { reasoning: ctx.reasoning }),
		snapshot,
	});
}

export function prepareFlowCheckpointMessage(
	ctx: FlowTextGenerationContext,
	pending: { status: string; diff: string },
) {
	return prepareCheckpointMessage({
		status: pending.status,
		diff: pending.diff,
		textGenerator: ctx.textGenerator,
		modelRef: ctx.modelRef,
		...(ctx.reasoning === undefined ? {} : { reasoning: ctx.reasoning }),
	});
}

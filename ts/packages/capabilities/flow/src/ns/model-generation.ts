import { prepareCheckpointMessage } from "@nseng-ai/capability-kit/checkpoint-flow";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import { draftChangesSummary } from "../changes/changes-model-summary.ts";

export type FlowTextGenerationContext = Pick<NsExtensionApi, "env" | "textGenerator"> & {
	modelSelection: ModelSelection;
};

export function prepareFlowChangesSummary(
	ctx: FlowTextGenerationContext,
	snapshot: { branch: string; status: string; diff: string },
) {
	return draftChangesSummary({
		textGenerator: ctx.textGenerator,
		modelSelection: ctx.modelSelection,
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
		modelSelection: ctx.modelSelection,
	});
}

import type { SdlExtensionApi } from "@sdl/kernel/sdk";

import { prepareCheckpointMessage } from "@sdl/capability-kit/checkpoint-flow";
import { selectCheckpointModelRef } from "@sdl/capability-kit/text-generation";

export type FlowModelGenerationContext = Pick<SdlExtensionApi, "env" | "textGenerator">;

export function prepareFlowCheckpointMessage(
	ctx: FlowModelGenerationContext,
	pending: { status: string; diff: string },
) {
	return prepareCheckpointMessage({
		status: pending.status,
		diff: pending.diff,
		textGenerator: ctx.textGenerator,
		modelRef: selectCheckpointModelRef(ctx.env),
	});
}

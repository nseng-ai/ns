import type { SdlExtensionApi } from "@sdl/kernel/sdk";

import { selectCheckpointModelRef } from "./text-generation.ts";
import { draftChangesSummary, prepareCheckpointMessage } from "./text-helpers.ts";

export type FlowModelGenerationContext = Pick<SdlExtensionApi, "env" | "textGenerator">;

export function prepareFlowChangesSummary(
	ctx: FlowModelGenerationContext,
	snapshot: { branch: string; status: string; diff: string },
) {
	return draftChangesSummary({
		textGenerator: ctx.textGenerator,
		env: ctx.env,
		snapshot,
	});
}

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

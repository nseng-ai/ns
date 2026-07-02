import type { SdlExtensionApi } from "@sdl/kernel/sdk";

import { prepareCheckpointMessage } from "@sdl/capability-kit/checkpoint-flow";
import { selectCheckpointModelRef } from "@sdl/capability-kit/text-generation";

import { draftChangesSummary } from "../changes/changes-model-summary.ts";

export type FlowTextGenerationContext = Pick<SdlExtensionApi, "env" | "textGenerator">;

export function prepareFlowChangesSummary(
	ctx: FlowTextGenerationContext,
	snapshot: { branch: string; status: string; diff: string },
) {
	return draftChangesSummary({
		textGenerator: ctx.textGenerator,
		env: ctx.env,
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
		modelRef: selectCheckpointModelRef(ctx.env),
	});
}

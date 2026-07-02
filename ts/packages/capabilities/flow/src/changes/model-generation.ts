import type { SdlExtensionApi } from "@sdl/kernel/sdk";
import { draftChangesSummary } from "./changes-model-summary.ts";

export type FlowChangesModelGenerationContext = Pick<SdlExtensionApi, "env" | "textGenerator">;

export function prepareFlowChangesSummary(
	ctx: FlowChangesModelGenerationContext,
	snapshot: { branch: string; status: string; diff: string },
) {
	return draftChangesSummary({
		textGenerator: ctx.textGenerator,
		env: ctx.env,
		snapshot,
	});
}

import { resolveRenderCapabilities, type RenderCapabilities } from "@sdl/clinkr";
import { renderResultBlock, type ResultBlockKind } from "@sdl/cli-theme";

export type HandoffDestructiveResultKind = ResultBlockKind;

export interface HandoffDestructiveResultBlock {
	kind: HandoffDestructiveResultKind;
	headline: string;
	body?: string | undefined;
	guidance?: string | undefined;
}

export function renderHandoffDestructiveResultBlock(
	renderCapabilities: RenderCapabilities,
	input: HandoffDestructiveResultBlock,
): string {
	return renderResultBlock(resolveRenderCapabilities(renderCapabilities), input);
}

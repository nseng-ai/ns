import type { RenderCapabilities } from "@sdl/clinkr";
import { renderDestructiveResultBlock, type ResultBlockKind } from "@sdl/cli-theme";

export type HandoffDestructiveResultKind = ResultBlockKind;

export interface HandoffDestructiveResultBlock {
	kind: HandoffDestructiveResultKind;
	headline: string;
	body?: string;
	guidance?: string;
}

export function renderHandoffDestructiveResultBlock(
	renderCapabilities: RenderCapabilities,
	input: HandoffDestructiveResultBlock,
): string {
	return renderDestructiveResultBlock(renderCapabilities, input);
}

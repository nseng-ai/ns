import type { RenderCapabilities } from "@sdl/clinkr";
import { renderDestructiveResultBlock, type ResultBlockKind } from "@sdl/cli-theme";

export type SlotDestructiveResultKind = ResultBlockKind;

export interface SlotDestructiveResultBlock {
	kind: SlotDestructiveResultKind;
	headline: string;
	body?: string;
	guidance?: string;
}

export function renderSlotDestructiveResultBlock(
	renderCapabilities: RenderCapabilities,
	input: SlotDestructiveResultBlock,
): string {
	return renderDestructiveResultBlock(renderCapabilities, input);
}

import { resolveSettledNonInteractiveCaps, type RenderCapabilities } from "@sdl/clinkr";
import { renderResultBlock, type ResultBlockKind } from "@sdl/cli-theme";

export type SlotDestructiveResultKind = ResultBlockKind;

export interface SlotDestructiveResultBlock {
	kind: SlotDestructiveResultKind;
	headline: string;
	body?: string | undefined;
	guidance?: string | undefined;
}

export function renderSlotDestructiveResultBlock(
	renderCaps: RenderCapabilities | undefined,
	input: SlotDestructiveResultBlock,
): string {
	return renderResultBlock(renderCaps?.caps ?? resolveSettledNonInteractiveCaps(), input);
}

import type { RenderCapabilities } from "@sdl/clinkr";
import { renderDestructiveResultBlock, type ResultBlockKind } from "@sdl/cli-theme";

export type SlotDestructiveResultKind = ResultBlockKind;

export interface SlotDestructiveResultBlock {
	kind: SlotDestructiveResultKind;
	headline: string;
	body?: string;
	guidance?: string;
}

export interface BuildSlotDestructiveResultBlockInput {
	kind: SlotDestructiveResultKind;
	headline: string;
	body?: string | undefined;
	guidance?: string | undefined;
}

export function buildSlotDestructiveResultBlock(
	input: BuildSlotDestructiveResultBlockInput,
): SlotDestructiveResultBlock {
	return {
		kind: input.kind,
		headline: input.headline,
		...(input.body === undefined ? {} : { body: input.body }),
		...(input.guidance === undefined ? {} : { guidance: input.guidance }),
	};
}

export function renderSlotDestructiveResultBlock(
	renderCapabilities: RenderCapabilities,
	input: SlotDestructiveResultBlock,
): string {
	return renderDestructiveResultBlock(renderCapabilities, input);
}

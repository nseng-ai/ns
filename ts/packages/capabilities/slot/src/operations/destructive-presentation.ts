import type { RenderCapabilities } from "@sdl/clinkr";
import { renderDestructiveResultBlock, type ResultBlockKind } from "@sdl/cli-theme";
import { optionalEntry } from "@sdl/core/primitives";

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
	body?: string;
	guidance?: string;
}

export function buildSlotDestructiveResultBlock(
	input: BuildSlotDestructiveResultBlockInput,
): SlotDestructiveResultBlock {
	return {
		kind: input.kind,
		headline: input.headline,
		...optionalEntry("body", input.body),
		...optionalEntry("guidance", input.guidance),
	};
}

export function renderSlotDestructiveResultBlock(
	renderCapabilities: RenderCapabilities,
	input: SlotDestructiveResultBlock,
): string {
	return renderDestructiveResultBlock(renderCapabilities, input);
}

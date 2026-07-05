import type { RenderCapabilities } from "@nseng-ai/clinkr";
import { renderDestructiveResultBlock, type ResultBlockKind } from "@nseng-ai/core/cli-theme";
import { optionalEntries } from "@nseng-ai/core/primitives";

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
		...optionalEntries({ body: input.body, guidance: input.guidance }),
	};
}

export function renderSlotDestructiveResultBlock(
	renderCapabilities: RenderCapabilities,
	input: SlotDestructiveResultBlock,
): string {
	return renderDestructiveResultBlock(renderCapabilities, input);
}

import { resolveRenderCapabilities, type Caps, type RenderCapabilities } from "@ns/clinkr";
import { dim, paint, renderResultBlock } from "@ns/core/cli-theme";

import type { NavigationResultFields } from "./navigation-result.ts";

export interface SlotNavigationPresentationInput extends NavigationResultFields {
	headline: string;
	details?: readonly string[];
}

export function renderSlotNavigationSuccess(
	input: SlotNavigationPresentationInput,
	renderCapabilities: RenderCapabilities = { canEmitAnsi: false },
): string {
	const caps = resolveRenderCapabilities(renderCapabilities);
	const clipboardLine = renderClipboardLine(input, caps);
	return renderResultBlock(caps, {
		kind: "success",
		headline: input.headline,
		body: [...(input.details ?? []), input.cdCommand].join("\n"),
		...(clipboardLine === undefined ? {} : { guidance: clipboardLine }),
	});
}

function renderClipboardLine(input: NavigationResultFields, caps: Caps): string | undefined {
	if (input.clipboardSkipped) return undefined;
	if (input.clipboardCopied) return dim("Copied cd command to clipboard.");
	return paint(
		caps,
		"warn",
		`Clipboard unavailable (${input.clipboardFailureDetail ?? "pbcopy failed"})`,
	);
}

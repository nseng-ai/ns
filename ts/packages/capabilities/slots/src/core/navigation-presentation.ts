import { resolveRenderCapabilities, type Caps, type RenderCapabilities } from "@nseng-ai/clinkr";
import { dim, paint, renderResultBlock } from "@nseng-ai/foundation/cli-theme";

import type { NavigationResultFields } from "./navigation-result.ts";

export type SlotNavigationPresentationInput = NavigationResultFields & {
	headline: string;
	details?: readonly string[];
};

export function renderSlotNavigationSuccess(
	input: SlotNavigationPresentationInput,
	renderCapabilities: RenderCapabilities = { canEmitAnsi: false },
): string {
	const caps = resolveRenderCapabilities(renderCapabilities);
	const clipboardLine = renderClipboardLine(input, caps);
	const guidance = [
		...(clipboardLine === undefined ? [] : [clipboardLine]),
		...(input.cdDirectiveStatus === "failed" ? [renderCdDirectiveFailureLine(input, caps)] : []),
	];
	return renderResultBlock(caps, {
		kind: "success",
		headline: input.headline,
		body: [...(input.details ?? []), input.cdCommand].join("\n"),
		...(guidance.length === 0 ? {} : { guidance: guidance.join("\n") }),
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

function renderCdDirectiveFailureLine(input: NavigationResultFields, caps: Caps): string {
	return paint(
		caps,
		"warn",
		`Parent-shell navigation unavailable at ${input.cdDirectivePath ?? "the configured directive path"} (${input.cdDirectiveFailureDetail ?? "directive write failed"})`,
	);
}

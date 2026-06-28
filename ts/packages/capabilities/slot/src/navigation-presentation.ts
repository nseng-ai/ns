import { resolveSettledNonInteractiveCaps, type RenderCapabilities } from "@sdl/clinkr";
import { dim, paint, resultBlockHeadline } from "@sdl/clinkr/theme";

import type { NavigationResultFields } from "./navigation-result.ts";

export interface SlotNavigationPresentationInput extends NavigationResultFields {
	headline: string;
}

export function renderSlotNavigationSuccess(
	input: SlotNavigationPresentationInput,
	renderCapabilities: RenderCapabilities = { canEmitAnsi: false },
): string {
	const caps = renderCapabilities.caps ?? resolveSettledNonInteractiveCaps();
	const lines = [
		resultBlockHeadline(caps, { kind: "success", headline: input.headline }),
		input.cd_command,
	];
	const clipboardLine = renderClipboardLine(input, caps);
	if (clipboardLine !== undefined) lines.push(clipboardLine);
	return lines.join("\n");
}

function renderClipboardLine(
	input: NavigationResultFields,
	caps: ReturnType<typeof resolveSettledNonInteractiveCaps>,
): string | undefined {
	if (input.clipboard_skipped) return undefined;
	if (input.clipboard_copied) return dim("Copied cd command to clipboard.");
	return paint(
		caps,
		"warn",
		`Clipboard unavailable (${input.clipboard_failure_detail ?? "pbcopy failed"})`,
	);
}

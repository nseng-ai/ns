import type { StyledText } from "@opentui/core";

export function styledTextContent(frame: StyledText): string {
	return frame.chunks.map((chunk) => chunk.text).join("");
}

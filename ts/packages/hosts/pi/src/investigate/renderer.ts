import type { CustomMessage, RenderComponent, RenderTheme } from "../handoff/runtime-types.ts";
import { truncateDisplayLine } from "../terminal/presentation.ts";

const COLLAPSED_RESULT_PREVIEW_LINES = 24;

export function renderInvestigationResultMessage(
	message: CustomMessage,
	options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const contentLines = message.content.split("\n");
	return {
		render(width: number): string[] {
			const lines = options.expanded ? contentLines : collapseInvestigationLines(contentLines);
			return lines.map((line, index) =>
				styleInvestigationLine(truncateDisplayLine(line, width), index, theme),
			);
		},
		invalidate(): void {},
	};
}

function collapseInvestigationLines(lines: readonly string[]): string[] {
	if (lines.length <= COLLAPSED_RESULT_PREVIEW_LINES) return [...lines];
	return [
		...lines.slice(0, COLLAPSED_RESULT_PREVIEW_LINES),
		"",
		`[Investigation result collapsed: showing first ${COLLAPSED_RESULT_PREVIEW_LINES} of ${lines.length} lines. Expand to view the full report.]`,
	];
}

function styleInvestigationLine(line: string, index: number, theme: RenderTheme): string {
	if (line.length === 0) return line;
	if (index === 0 || line.startsWith("## ")) {
		return theme.fg("accent", theme.bold !== undefined ? theme.bold(line) : line);
	}
	if (
		line.startsWith("Session file:") ||
		line.startsWith("Status:") ||
		line.startsWith("[Investigation result collapsed:")
	) {
		return theme.fg("muted", line);
	}
	return line;
}

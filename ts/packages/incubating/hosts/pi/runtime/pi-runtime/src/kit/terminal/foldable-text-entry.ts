import { truncateToWidth } from "@earendil-works/pi-tui";
import type { EntryRenderComponent, EntryRenderTheme } from "@nseng-ai/extension-kit/pi-types";

/**
 * Already-validated semantic inputs for a foldable transcript text entry:
 * a styled header, gutter-prefixed body lines, and a collapsed remainder line.
 */
export interface FoldableTextEntryOptions {
	/** Plain header text; styled accent + bold by the component. */
	title: string;
	/** Plain body lines; each is prefixed with the accent gutter. */
	lines: readonly string[];
	/** Whether the entry is expanded to its full body. */
	expanded: boolean;
	/** Number of body lines shown while collapsed. */
	previewLineLimit: number;
	/** Plain gutter prefix, for example "▌ ". */
	gutter: string;
	theme: EntryRenderTheme;
}

/**
 * Width-safe foldable text entry renderer. Every returned line satisfies
 * Pi's display-width invariant (`visibleWidth(line) <= max(0, width)`),
 * including ANSI-styled themes, wide/combining Unicode, and widths narrower
 * than the gutter or header.
 */
export function createFoldableTextEntryComponent(
	options: FoldableTextEntryOptions,
): EntryRenderComponent {
	const theme = options.theme;
	return {
		render(width: number): string[] {
			const maxWidth = Math.max(0, Math.floor(width));
			const fit = (line: string): string => truncateToWidth(line, maxWidth, "…");
			const bold = theme.bold ?? ((text: string) => text);
			const gutter = theme.fg("accent", options.gutter);
			const shown = options.expanded
				? options.lines
				: options.lines.slice(0, options.previewLineLimit);
			const rendered = [
				fit(theme.fg("accent", bold(options.title))),
				"",
				...shown.map((line) => fit(gutter + theme.fg("text", line))),
			];
			const hiddenLines = options.lines.length - shown.length;
			if (!options.expanded && hiddenLines > 0) {
				rendered.push(
					fit(gutter + theme.fg("dim", `… (+${hiddenLines} more lines — expand to view)`)),
				);
			}
			return rendered;
		},
		invalidate(): void {},
	};
}

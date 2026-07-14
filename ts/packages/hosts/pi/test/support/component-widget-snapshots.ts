import type { WidgetContent, WidgetTheme } from "../../src/runtime/tool-types.ts";

const identityTheme: WidgetTheme = {
	fg: (_color, text) => text,
};

interface CaptureComponentWidgetRendersOptions {
	width?: number;
	onRender?: (lines: string[]) => void;
}

/** Installs component widget content in a snapshotting fake TUI and captures every render. */
export function captureComponentWidgetRenders(
	content: WidgetContent,
	options: CaptureComponentWidgetRendersOptions = {},
): string[][] {
	const renders: string[][] = [];
	const width = options.width ?? 100;
	if (Array.isArray(content)) {
		const lines = [...content];
		renders.push(lines);
		options.onRender?.(lines);
		return renders;
	}

	let component: ReturnType<typeof content> | undefined;
	const snapshot = (): void => {
		if (component === undefined) return;
		const lines = component.render(width);
		renders.push(lines);
		options.onRender?.(lines);
	};
	component = content({ requestRender: snapshot }, identityTheme);
	snapshot();
	return renders;
}

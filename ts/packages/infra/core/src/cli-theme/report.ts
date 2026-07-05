import { resolveRenderCapabilities, type RenderCapabilities } from "@nseng-ai/clinkr";
import { stripTerminalEscapes } from "../primitives/terminal-escapes.ts";

import { paint } from "./palette.ts";

export interface BufferedReportSection {
	readonly title: string;
	readonly lines: readonly string[];
}

export interface RenderBufferedReportOptions {
	readonly caps: RenderCapabilities;
	readonly title: string;
	readonly titleStyle?: "accent" | "plain";
	readonly sections: readonly BufferedReportSection[];
}

export function stripAnsiWhenDisabled(output: string, caps: RenderCapabilities): string {
	return caps.canEmitAnsi ? output : stripTerminalEscapes(output);
}

export function renderBufferedReport(options: RenderBufferedReportOptions): string {
	const resolvedCaps = resolveRenderCapabilities(options.caps);
	const title =
		options.titleStyle === "plain" ? options.title : paint(resolvedCaps, "accent", options.title);
	const lines = [title];
	for (const section of options.sections) {
		if (section.title === "") {
			lines.push("", ...section.lines);
			continue;
		}
		lines.push("", section.title, ...section.lines);
	}
	return stripAnsiWhenDisabled(lines.join("\n"), options.caps);
}

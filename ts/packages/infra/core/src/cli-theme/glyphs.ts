// The glyph set for ns CLI theme: status marks, spinner frames, rule/tree characters, and the
// ellipsis. Every helper switches on `caps.canRenderUnicode` so an ASCII-only terminal still reads correctly.

import type { Caps } from "@nseng-ai/clinkr";

export type GlyphName = "done" | "open" | "blocked" | "fail" | "skip" | "bullet";

const GLYPHS: Record<GlyphName, { unicode: string; ascii: string }> = {
	done: { unicode: "✓", ascii: "v" },
	open: { unicode: "●", ascii: "o" },
	blocked: { unicode: "⊘", ascii: "!" },
	fail: { unicode: "✗", ascii: "x" },
	skip: { unicode: "–", ascii: "-" },
	bullet: { unicode: "•", ascii: "*" },
};

export function glyph(caps: Caps, name: GlyphName): string {
	const g = GLYPHS[name];
	return caps.canRenderUnicode ? g.unicode : g.ascii;
}

const SPINNER_UNICODE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_ASCII = ["|", "/", "-", "\\"];

export function spinnerFrame(caps: Caps, tick: number): string {
	const frames = caps.canRenderUnicode ? SPINNER_UNICODE : SPINNER_ASCII;
	const frame = frames[tick % frames.length];
	return frame === undefined ? "" : frame;
}

export function ruleChar(caps: Caps): string {
	return caps.canRenderUnicode ? "─" : "-";
}

export interface TreeMarkers {
	tee: string;
	last: string;
}

export function treeMarkers(caps: Caps): TreeMarkers {
	return caps.canRenderUnicode ? { tee: "├", last: "└" } : { tee: "|-", last: "`-" };
}

export function ellipsisFor(caps: Caps): string {
	return caps.canRenderUnicode ? "…" : "...";
}

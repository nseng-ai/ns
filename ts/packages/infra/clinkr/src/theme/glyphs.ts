// The glyph set for clinkr's theme: status marks, spinner frames, rule/tree characters, and the
// ellipsis. Every helper switches on `caps.unicode` so an ASCII-only terminal still reads correctly.

import type { Caps } from "../caps.ts";

export type GlyphName = "done" | "open" | "fail" | "skip" | "bullet";

const GLYPHS: Record<GlyphName, { unicode: string; ascii: string }> = {
	done: { unicode: "✓", ascii: "v" },
	open: { unicode: "●", ascii: "o" },
	fail: { unicode: "✗", ascii: "x" },
	skip: { unicode: "–", ascii: "-" },
	bullet: { unicode: "•", ascii: "*" },
};

export function glyph(caps: Caps, name: GlyphName): string {
	const g = GLYPHS[name];
	return caps.unicode ? g.unicode : g.ascii;
}

const SPINNER_UNICODE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_ASCII = ["|", "/", "-", "\\"];

export function spinnerFrame(caps: Caps, tick: number): string {
	const frames = caps.unicode ? SPINNER_UNICODE : SPINNER_ASCII;
	const frame = frames[tick % frames.length];
	return frame === undefined ? "" : frame;
}

export function ruleChar(caps: Caps): string {
	return caps.unicode ? "─" : "-";
}

export interface TreeMarkers {
	tee: string;
	last: string;
}

export function treeMarkers(caps: Caps): TreeMarkers {
	return caps.unicode ? { tee: "├", last: "└" } : { tee: "|-", last: "`-" };
}

export function ellipsisFor(caps: Caps): string {
	return caps.unicode ? "…" : "...";
}

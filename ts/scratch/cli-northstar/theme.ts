// THROWAWAY steelthread harness — the house visual language, hand-rolled.
//
// Semantic palette (success/warn/error/accent/muted), the glyph set `✓ ● ✗ – •`, spinner,
// tree markers, and width helpers. Deliberately dependency-free: the real rebuild uses
// `ansis` (truecolor/hex) and `log-update`; here we emit raw escapes so each rung of the
// ladder is forced exactly, with no library auto-detection in the way.

import type { Caps, Swatch } from "./caps.ts";
import { effectiveDepth } from "./caps.ts";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

export type { Swatch };

export type Intent = "success" | "warn" | "error" | "accent" | "muted";

// Dialed-in semantic palette (2026-06-27). success/warn/error/muted are GitHub-derived for proven
// dark-terminal legibility; `accent` is the brand accent (overridable per-render via Caps.accent
// for candidate previews). x16 uses bright SGR codes as the 16-color approximation rung.
export const PALETTE: Record<Intent, Swatch> = {
	success: { rgb: [63, 185, 80], x256: 71, x16: "92" }, // #3fb950
	warn: { rgb: [210, 153, 34], x256: 178, x16: "93" }, // #d29922
	error: { rgb: [248, 81, 73], x256: 203, x16: "91" }, // #f85149
	accent: { rgb: [34, 211, 238], x256: 45, x16: "96" }, // #22d3ee cyan (chosen brand accent)
	muted: { rgb: [139, 148, 158], x256: 245, x16: "90" }, // #8b949e
};

function swatchSgr(caps: Caps, swatch: Swatch): string {
	switch (effectiveDepth(caps)) {
		case "truecolor":
			return `\x1b[38;2;${swatch.rgb[0]};${swatch.rgb[1]};${swatch.rgb[2]}m`;
		case "ansi256":
			return `\x1b[38;5;${swatch.x256}m`;
		case "ansi16":
			return `\x1b[${swatch.x16}m`;
		case "none":
			return "";
	}
}

/** Colorize text with an explicit swatch (used to preview accent candidates outside the palette). */
export function paintSwatch(caps: Caps, swatch: Swatch, text: string): string {
	const open = swatchSgr(caps, swatch);
	return open === "" ? text : `${open}${text}${RESET}`;
}

function swatchFor(caps: Caps, intent: Intent): Swatch {
	return intent === "accent" ? (caps.accent ?? PALETTE.accent) : PALETTE[intent];
}

export function paint(caps: Caps, intent: Intent, text: string): string {
	// Mono: color is gone. Keep only the dimming of muted text so hierarchy survives; success /
	// error / etc. lean entirely on their glyph to read. That honesty is the point.
	if (effectiveDepth(caps) === "none") {
		return intent === "muted" ? `${DIM}${text}${RESET}` : text;
	}
	return paintSwatch(caps, swatchFor(caps, intent), text);
}

export function dim(text: string): string {
	return `${DIM}${text}${RESET}`;
}

export function bold(text: string): string {
	return `${BOLD}${text}${RESET}`;
}

// --- glyphs -----------------------------------------------------------------

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

// --- width helpers ----------------------------------------------------------

// Strip SGR escapes so layout math measures visible cells, not bytes.
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}

export function visibleWidth(text: string): number {
	return stripAnsi(text).length;
}

/** Truncate plain (unstyled) text to `width`, appending an ellipsis when it overflows. */
export function truncatePlain(text: string, width: number, ellipsis = "…"): string {
	if (width <= 0) return "";
	if (text.length <= width) return text;
	const mark = ellipsis.length < width ? ellipsis : ellipsis.slice(0, Math.max(0, width));
	return `${text.slice(0, width - mark.length)}${mark}`;
}

export function ellipsisFor(caps: Caps): string {
	return caps.unicode ? "…" : "...";
}

export function padPlain(text: string, width: number): string {
	return text.length >= width ? text : text + " ".repeat(width - text.length);
}

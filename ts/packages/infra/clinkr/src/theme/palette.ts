// The visual core of clinkr's opt-in theme: a semantic palette (success/warn/error/accent/muted)
// and the `paint`/`paintSwatch`/`dim`/`bold` colorizers that degrade it across color rungs.
//
// Design decision (approved 2026-06-27): emit the dialed-in SGR strings DIRECTLY rather than letting
// `ansis` auto-quantize. The fallback codes below are hand-tuned per rung, and tests assert on the
// literal escapes; routing through ansis risks re-quantization that would silently change the output.
// We drive the rung explicitly off `caps.colorDepth` (already resolved by caps.ts — never ansis auto-
// detection). `ansis` is still the package dependency, used for SGR stripping in text.ts.

import type { Caps } from "../caps.ts";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

/** A single color resolved at every rung: 24-bit rgb, 256-color index, and bright-16 SGR number. */
export interface Swatch {
	rgb: [number, number, number];
	x256: number;
	x16: string;
}

export type Intent = "success" | "warn" | "error" | "accent" | "muted";

// Dialed-in semantic palette (2026-06-27 sign-off). success/warn/error/muted are GitHub-derived for
// proven dark-terminal legibility; `accent` is the chosen brand accent (cyan). x16 uses bright SGR
// codes as the 16-color approximation rung.
export const PALETTE: Record<Intent, Swatch> = {
	success: { rgb: [63, 185, 80], x256: 71, x16: "92" }, // #3fb950
	warn: { rgb: [210, 153, 34], x256: 178, x16: "93" }, // #d29922
	error: { rgb: [248, 81, 73], x256: 203, x16: "91" }, // #f85149
	accent: { rgb: [34, 211, 238], x256: 45, x16: "96" }, // #22d3ee cyan (chosen brand accent)
	muted: { rgb: [139, 148, 158], x256: 245, x16: "90" }, // #8b949e
};

/** Foreground SGR open sequence for a swatch at the given rung; "" for mono (no color). */
function swatchSgr(caps: Caps, swatch: Swatch): string {
	switch (caps.colorDepth) {
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

/** Colorize text with an explicit swatch — the accent-override path for previewing candidates. */
export function paintSwatch(caps: Caps, swatch: Swatch, text: string): string {
	const open = swatchSgr(caps, swatch);
	return open === "" ? text : `${open}${text}${RESET}`;
}

export function paint(caps: Caps, intent: Intent, text: string): string {
	// Mono honesty: color is gone, so keep only the dimming of muted text so hierarchy survives;
	// success/error/etc. lean entirely on their glyph to read. That honesty is the point.
	if (caps.colorDepth === "none") {
		return intent === "muted" ? `${DIM}${text}${RESET}` : text;
	}
	return paintSwatch(caps, PALETTE[intent], text);
}

export function dim(text: string): string {
	return `${DIM}${text}${RESET}`;
}

export function bold(text: string): string {
	// Bold survives mono — load-bearing for failure summaries — so it never consults colorDepth.
	return `${BOLD}${text}${RESET}`;
}

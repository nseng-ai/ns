// THROWAWAY steelthread harness — palette + accent dial-in.
//
// `renderPalette` shows the semantic intents as swatches (and the accent's degradation across
// rungs); `renderAccents` shows brand-accent candidates in their real usages so one can be picked
// by feel. Preview any candidate live in the real surfaces with `--accent <name>`.

import type { Caps, ColorDepth, Swatch } from "./caps.ts";
import type { Intent } from "./theme.ts";
import { bold, dim, glyph, paint, PALETTE, paintSwatch, ruleChar, spinnerFrame } from "./theme.ts";

export interface AccentCandidate {
	name: string;
	hex: string;
	swatch: Swatch;
}

export const ACCENT_CANDIDATES: readonly AccentCandidate[] = [
	{ name: "sky", hex: "#38bdf8", swatch: { rgb: [56, 189, 248], x256: 75, x16: "96" } },
	{ name: "cyan", hex: "#22d3ee", swatch: { rgb: [34, 211, 238], x256: 45, x16: "96" } },
	{ name: "teal", hex: "#2dd4bf", swatch: { rgb: [45, 212, 191], x256: 43, x16: "96" } },
	{ name: "blue", hex: "#58a6ff", swatch: { rgb: [88, 166, 255], x256: 111, x16: "94" } },
	{ name: "indigo", hex: "#818cf8", swatch: { rgb: [129, 140, 248], x256: 105, x16: "94" } },
	{ name: "violet", hex: "#a78bfa", swatch: { rgb: [167, 139, 250], x256: 141, x16: "95" } },
	{ name: "magenta", hex: "#f778ba", swatch: { rgb: [247, 120, 186], x256: 211, x16: "95" } },
];

export function findAccent(name: string): AccentCandidate | undefined {
	return ACCENT_CANDIDATES.find((candidate) => candidate.name === name);
}

function isDefaultAccent(swatch: Swatch): boolean {
	const [r, g, b] = PALETTE.accent.rgb;
	return swatch.rgb[0] === r && swatch.rgb[1] === g && swatch.rgb[2] === b;
}

interface IntentRow {
	intent: Intent;
	glyphName: "done" | "open" | "fail" | "skip";
	hex: string;
	usage: string;
}

const INTENT_ROWS: readonly IntentRow[] = [
	{ intent: "success", glyphName: "done", hex: "#3fb950", usage: "closed objective, PR created" },
	{ intent: "accent", glyphName: "open", hex: "#22d3ee", usage: "status dot, PR #2201, active spinner" },
	{ intent: "warn", glyphName: "open", hex: "#d29922", usage: "x outstanding-changes marker" },
	{ intent: "error", glyphName: "fail", hex: "#f85149", usage: "failed submit summary" },
	{ intent: "muted", glyphName: "skip", hex: "#8b949e", usage: "timestamps, secondary text" },
];

const RUNG_ORDER: readonly ColorDepth[] = ["truecolor", "ansi256", "ansi16", "none"];

export function renderPalette(caps: Caps): string {
	const lines: string[] = [bold("Palette — semantic intents"), ""];
	for (const row of INTENT_ROWS) {
		const mark = paint(caps, row.intent, glyph(caps, row.glyphName));
		const name = paint(caps, row.intent, row.intent.padEnd(8));
		lines.push(`  ${mark}  ${name} ${dim(row.hex)}   ${dim(row.usage)}`);
	}
	lines.push("", dim("accent across the ladder (approach A):"));
	const strip = RUNG_ORDER.map((colorDepth) => {
		const rung: Caps = { ...caps, colorDepth, ladder: "A" };
		return `${paint(rung, "accent", glyph(caps, "open"))} ${colorDepth}`;
	});
	lines.push(`  ${strip.join(dim("   "))}`);
	return lines.join("\n") + "\n";
}

export function renderAccents(caps: Caps): string {
	const lines: string[] = [
		bold("Accent candidates"),
		dim("preview live in context:  objective-list --accent <name>   ·   flow-submit --accent <name>"),
		"",
	];
	const nameW = Math.max(...ACCENT_CANDIDATES.map((c) => c.name.length));
	for (const candidate of ACCENT_CANDIDATES) {
		const sw = candidate.swatch;
		const sample = [
			paintSwatch(caps, sw, glyph(caps, "open")),
			paintSwatch(caps, sw, "#2201"),
			paintSwatch(caps, sw, spinnerFrame(caps, 2)),
			paintSwatch(caps, sw, "https://github.com/…/pull/2201"),
		].join("  ");
		const tag = isDefaultAccent(sw) ? dim("  (default)") : "";
		lines.push(`  ${paintSwatch(caps, sw, candidate.name.padEnd(nameW))}  ${dim(candidate.hex)}   ${sample}${tag}`);
	}
	return lines.join("\n") + "\n";
}

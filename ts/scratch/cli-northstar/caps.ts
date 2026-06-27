// THROWAWAY steelthread harness — capability knobs.
//
// This is NOT the real clinkr `Caps`. The real (widened) Caps + resolveCaps() land in
// clinkr *core* at the rebuild step of the cli-ux-north-star Objective. Here we hand-roll
// a knob bag whose only job is to let us *force* color depth / width / unicode in a real
// terminal so the palette ladder can be felt rather than guessed.

export type ColorDepth = "truecolor" | "ansi256" | "ansi16" | "none";

// A single color resolved at each rung of the ladder: full hex (truecolor), the xterm-256 index,
// and the 16-color SGR code. Lives here (not theme) so an accent override can ride on Caps without
// theme and caps importing each other.
export interface Swatch {
	rgb: readonly [number, number, number];
	x256: number;
	x16: string;
}

// The decision this whole harness exists to make, by feel:
//   A = full capability ladder   truecolor -> 256 -> 16 -> mono
//   B = modern-only              truecolor / 256 -> straight to mono (no 16-color rung)
export type Ladder = "A" | "B";

export interface Caps {
	colorDepth: ColorDepth;
	columns: number;
	unicode: boolean;
	ladder: Ladder;
	/** Whether streaming renderers may animate (own the cursor). Off when piped / non-tty. */
	motion: boolean;
	/** Optional brand-accent override, for previewing candidate accents (--accent). */
	accent?: Swatch | undefined;
}

const COLOR_DEPTHS: readonly ColorDepth[] = ["truecolor", "ansi256", "ansi16", "none"];

export function isColorDepth(value: string): value is ColorDepth {
	return (COLOR_DEPTHS as readonly string[]).includes(value);
}

/**
 * The color depth a renderer should actually paint at, after applying the ladder choice.
 * Under approach B a 16-color terminal degrades straight to mono — that is the entire
 * felt difference between the two approaches at the `--color 16` rung.
 */
export function effectiveDepth(caps: Caps): ColorDepth {
	if (caps.ladder === "B" && caps.colorDepth === "ansi16") return "none";
	return caps.colorDepth;
}

export function defaultCaps(): Caps {
	return {
		colorDepth: "truecolor",
		columns: 80,
		unicode: true,
		ladder: "A",
		motion: process.stdout.isTTY === true,
	};
}

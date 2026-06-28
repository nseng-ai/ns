import type { Caps, ColorDepth } from "./caps.ts";

export const CLINKR_CAPS_EXTENSION_KEY = "sdl.clinkr.caps";

const COLOR_DEPTHS = ["truecolor", "ansi256", "ansi16", "none"] as const satisfies readonly ColorDepth[];

export function readCapsFromHostExtension(value: unknown): Caps | undefined {
	if (!isRecord(value)) return undefined;
	const { isTty, colorDepth, columns, canRenderUnicode } = value;
	if (typeof isTty !== "boolean") return undefined;
	if (!isColorDepth(colorDepth)) return undefined;
	if (!Number.isFinite(columns) || !Number.isInteger(columns) || columns <= 0) return undefined;
	if (typeof canRenderUnicode !== "boolean") return undefined;
	return { isTty, colorDepth, columns, canRenderUnicode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isColorDepth(value: unknown): value is ColorDepth {
	return typeof value === "string" && COLOR_DEPTHS.includes(value as ColorDepth);
}

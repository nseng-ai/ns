import type { Caps, ColorDepth } from "./caps.ts";

export const CLINKR_CAPS_EXTENSION_KEY = "sdl.clinkr.caps";

export function readCapsFromHostExtension(value: unknown): Caps | undefined {
	if (!isRecord(value)) return undefined;
	const { isTty, colorDepth, columns, canRenderUnicode } = value;
	if (typeof isTty !== "boolean") return undefined;
	if (!isColorDepth(colorDepth)) return undefined;
	if (typeof columns !== "number") return undefined;
	if (!Number.isFinite(columns) || !Number.isInteger(columns) || columns <= 0) return undefined;
	if (typeof canRenderUnicode !== "boolean") return undefined;
	return { isTty, colorDepth, columns, canRenderUnicode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isColorDepth(value: unknown): value is ColorDepth {
	switch (value) {
		case "truecolor":
		case "ansi256":
		case "ansi16":
		case "none":
			return true;
		default:
			return false;
	}
}

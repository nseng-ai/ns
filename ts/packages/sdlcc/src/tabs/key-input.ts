import type { TabKeyInput } from "./tab-module.ts";

// Shared key normalization for tab modules. Modifier chords (ctrl/meta) are not part of any tab's
// key contract, so they resolve to `undefined` here and callers treat that as "no actionable key".
export function keyNameFromInput(key: TabKeyInput): string | undefined {
	if (key.ctrl || key.meta) return undefined;
	return key.name ?? printableCharacterFromInput(key);
}

// The single printable character a key event represents, or undefined for modifier chords,
// control characters, and multi-codepoint sequences.
export function printableCharacterFromInput(key: TabKeyInput): string | undefined {
	if (key.ctrl || key.meta) return undefined;
	const sequence = key.sequence;
	if (sequence === undefined || [...sequence].length !== 1) return undefined;
	if (sequence < " " || sequence === "\x7F") return undefined;
	return sequence;
}

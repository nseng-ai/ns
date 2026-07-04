/**
 * Pure extraction of the drafting agent's current draft from its reply text.
 *
 * Draft protocol: the compose agent ends every reply with a fenced block — a
 * line matching exactly `/^```draft\s*$/` (the opener), the full draft body,
 * then a closing line matching `/^```\s*$/`. The block carries the complete
 * draft every time (never a diff), so callers replace, not merge.
 *
 * This module performs no I/O and reads no clock; it only parses strings. CRLF
 * input is normalized to LF (lines are split on `/\r?\n/`), so a stray `\r`
 * never defeats fence matching or leaks into the extracted draft.
 */

const DRAFT_OPENER = /^```draft\s*$/;
const DRAFT_CLOSER = /^```\s*$/;

interface DraftBlock {
	/** Index of the opener line. */
	openerIndex: number;
	/** Exclusive end index of the block (past the closer, or `lines.length` when unterminated). */
	endExclusive: number;
	/** The raw lines between opener and closer (or opener and EOF). */
	contentLines: string[];
}

/** Extract the draft from an assistant reply per the ```draft fenced-block protocol; null when absent. */
export function extractDraft(text: string): string | null {
	const block = locateDraftBlock(text.split(/\r?\n/));
	if (block === null) return null;
	return draftFromContent(block.contentLines);
}

/** Replace the draft block with a short placeholder for transcript display. */
export function stripDraftBlock(text: string): string {
	const lines = text.split(/\r?\n/);
	const block = locateDraftBlock(lines);
	if (block === null) return text;

	const draft = draftFromContent(block.contentLines);
	const placeholder =
		draft === null ? "[draft block empty]" : `[draft updated — ${draft.split("\n").length} lines]`;

	const kept = [
		...lines.slice(0, block.openerIndex),
		placeholder,
		...lines.slice(block.endExclusive),
	];
	return trimTrailingWhitespace(kept.join("\n"));
}

/**
 * Find the draft block. The opener is the LAST line matching the opener regex
 * (a later block wins over an earlier one). From after that opener, the closer
 * is the LAST subsequent line matching the closer regex — tolerating stray
 * inner fences from a disobedient model. A missing closer takes content to EOF,
 * tolerating max-token truncation.
 */
function locateDraftBlock(lines: string[]): DraftBlock | null {
	const openerIndex = lines.findLastIndex((line) => DRAFT_OPENER.test(line));
	if (openerIndex === -1) return null;

	const after = lines.slice(openerIndex + 1);
	const closerRel = after.findLastIndex((line) => DRAFT_CLOSER.test(line));
	if (closerRel === -1) {
		return { openerIndex, endExclusive: lines.length, contentLines: after };
	}
	return {
		openerIndex,
		endExclusive: openerIndex + 1 + closerRel + 1,
		contentLines: after.slice(0, closerRel),
	};
}

/** Join the block content and trim trailing whitespace per the whole draft; whitespace-only → null. */
function draftFromContent(contentLines: string[]): string | null {
	const draft = trimTrailingWhitespace(contentLines.join("\n"));
	return draft.length === 0 ? null : draft;
}

function trimTrailingWhitespace(value: string): string {
	return value.replace(/\s+$/, "");
}

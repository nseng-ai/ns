/**
 * Pure re-rank for Pi slash-command NAME completion.
 *
 * Pi's built-in provider fuzzy-matches greedily over the whole command name, so
 * a namespaced suffix segment like `next` in `ns:objective:next` loses to
 * incidental matches whenever an earlier character (the leading `n` of `ns:`) is
 * consumed first. `slashCommandRerankQuery` recognizes a command-NAME completion
 * result and extracts the typed query; `rerankSlashCommandItems` promotes items
 * whose query matches a whole segment (tier 0) or a segment prefix (tier 1)
 * above the fuzzy-only remainder (tier 2), stably and without aliases.
 */

import type { AutocompleteItem, AutocompleteSuggestions } from "@nseng-ai/pi-runtime/runtime/types";

/**
 * The typed query (`next` for `/next`) when `suggestions` is slash-command-NAME
 * completion for the current cursor position; `null` otherwise.
 *
 * Mirrors the built-in input-state detection, then cross-checks the returned
 * shape so argument, at-prefix, and path completions are never re-ranked.
 */
export function slashCommandRerankQuery(
	lines: string[],
	cursorLine: number,
	cursorCol: number,
	suggestions: AutocompleteSuggestions,
): string | null {
	const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
	if (!textBeforeCursor.startsWith("/")) return null;
	// Plain space only, mirroring the built-in command-name branch exactly.
	if (textBeforeCursor.indexOf(" ") !== -1) return null;
	// Command-name completion returns prefix === textBeforeCursor; argument, at,
	// and path completions return a different prefix, so this rules them out.
	if (suggestions.prefix !== textBeforeCursor) return null;
	const query = textBeforeCursor.slice(1);
	if (query.length === 0) return null;
	// Command names never contain "/"; a slash means force-triggered path
	// completion slipped through with a slash-prefixed line. Leave it untouched.
	for (const item of suggestions.items) {
		if (item.value.includes("/")) return null;
	}
	return query;
}

/**
 * Stable tiered re-rank of command-NAME items for `query` (no leading slash).
 * Never mutates the input; returns a new array.
 */
export function rerankSlashCommandItems(
	items: readonly AutocompleteItem[],
	query: string,
): AutocompleteItem[] {
	const queryLower = query.toLowerCase();
	const wholeSegment: AutocompleteItem[] = [];
	const segmentPrefix: AutocompleteItem[] = [];
	const remainder: AutocompleteItem[] = [];
	for (const item of items) {
		const tier = classifyTier(item.value.toLowerCase(), queryLower);
		if (tier === 0) wholeSegment.push(item);
		else if (tier === 1) segmentPrefix.push(item);
		else remainder.push(item);
	}
	return [...wholeSegment, ...segmentPrefix, ...remainder];
}

type RerankTier = 0 | 1 | 2;

/** Segment starts: index 0 plus every index following a `:` or `-`. */
function segmentBoundaries(name: string): number[] {
	const boundaries = [0];
	for (let index = 1; index < name.length; index += 1) {
		const previous = name[index - 1];
		if (isSegmentDelimiter(previous)) boundaries.push(index);
	}
	return boundaries;
}

function isSegmentDelimiter(char: string | undefined): boolean {
	return char === ":" || char === "-";
}

/**
 * Tier 0: `query` spans whole segment(s) starting at some boundary. Tier 1:
 * `query` is a prefix of some segment. Tier 2: neither (fuzzy-only or no match).
 * Both inputs are already lowercased.
 */
function classifyTier(nameLower: string, queryLower: string): RerankTier {
	let hasSegmentPrefixMatch = false;
	for (const boundary of segmentBoundaries(nameLower)) {
		if (!nameLower.startsWith(queryLower, boundary)) continue;
		hasSegmentPrefixMatch = true;
		const nextChar = nameLower[boundary + queryLower.length];
		if (nextChar === undefined || isSegmentDelimiter(nextChar)) return 0;
	}
	return hasSegmentPrefixMatch ? 1 : 2;
}

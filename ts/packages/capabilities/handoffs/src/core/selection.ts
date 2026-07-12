import { HANDOFF_KEY_SUFFIX, isHandoffKey } from "./identity.ts";

/**
 * Deterministic handoff selection ladder shared by the Pi pickup command and
 * `ns handoff exec match`. Mirrors the handoff-pickup skill contract:
 *
 * 1. An exact key selector (`foo.md`) picks that handoff.
 * 2. A slug selector (`foo`) normalizes to `foo.md` and picks it when present.
 * 3. An empty selector picks the only handoff when exactly one exists.
 * 4. Otherwise selector words are matched as terms against the slug's words
 *    (slug split on `-`, `_`, and `.`; the `.md` suffix is ignored); handoffs
 *    whose slug contains every term are the candidates.
 */
export type HandoffSelectionMatchedBy = "exact-key" | "normalized-slug" | "only-handoff" | "terms";

export type HandoffSelectionResult<T> =
	| {
			resolution: "unique";
			matchedBy: HandoffSelectionMatchedBy;
			selected: T;
			candidates: readonly T[];
	  }
	| { resolution: "ambiguous"; candidates: readonly T[] }
	| { resolution: "none"; candidates: readonly T[] };

export function resolveHandoffSelection<T>(
	selector: readonly string[],
	items: readonly T[],
	keyOf: (item: T) => string,
): HandoffSelectionResult<T> {
	if (items.length === 0) {
		return { resolution: "none", candidates: [] };
	}

	if (selector.length === 0) {
		const onlyItem = items.length === 1 ? items[0] : undefined;
		if (onlyItem !== undefined) {
			return uniqueSelection("only-handoff", onlyItem);
		}
		return { resolution: "ambiguous", candidates: [...items] };
	}

	if (selector.length === 1) {
		const exactSelector = selector[0] ?? "";
		if (isHandoffKey(exactSelector)) {
			const exactMatches = items.filter((item) => keyOf(item) === exactSelector);
			const resolved = resolveCandidateSet("exact-key", exactMatches);
			if (resolved !== undefined) return resolved;
		}

		const normalizedKey = normalizeHandoffSelectorToKey(exactSelector);
		if (normalizedKey !== undefined) {
			const slugMatches = items.filter((item) => keyOf(item) === normalizedKey);
			const resolved = resolveCandidateSet("normalized-slug", slugMatches);
			if (resolved !== undefined) return resolved;
		}
	}

	const terms = splitHandoffSelectorTerms(selector);
	if (terms.length === 0) {
		return { resolution: "none", candidates: [] };
	}

	const termMatches = items.filter((item) => {
		const tokens = handoffKeyTokens(keyOf(item));
		return terms.every((term) => tokens.includes(term));
	});
	return (
		resolveCandidateSet("terms", termMatches) ?? {
			resolution: "none",
			candidates: [],
		}
	);
}

export function normalizeHandoffSelectorToKey(selector: string): string | undefined {
	const trimmed = selector.trim();
	if (trimmed.length === 0 || trimmed.includes("/")) {
		return undefined;
	}
	if (trimmed.endsWith(HANDOFF_KEY_SUFFIX)) {
		return isHandoffKey(trimmed) ? trimmed : undefined;
	}
	return `${trimmed}${HANDOFF_KEY_SUFFIX}`;
}

export function splitHandoffSelectorTerms(selector: readonly string[]): string[] {
	return selector
		.flatMap((part) => part.toLowerCase().split(/[-_.]+/))
		.filter((term) => term.length > 0);
}

function handoffKeyTokens(key: string): string[] {
	const slug = key.endsWith(HANDOFF_KEY_SUFFIX) ? key.slice(0, -HANDOFF_KEY_SUFFIX.length) : key;
	return splitHandoffSelectorTerms([slug]);
}

function uniqueSelection<T>(
	matchedBy: HandoffSelectionMatchedBy,
	selected: T,
): HandoffSelectionResult<T> {
	return { resolution: "unique", matchedBy, selected, candidates: [selected] };
}

function resolveCandidateSet<T>(
	matchedBy: HandoffSelectionMatchedBy,
	candidates: readonly T[],
): HandoffSelectionResult<T> | undefined {
	const onlyCandidate = candidates.length === 1 ? candidates[0] : undefined;
	if (onlyCandidate !== undefined) return uniqueSelection(matchedBy, onlyCandidate);
	if (candidates.length > 1) return { resolution: "ambiguous", candidates: [...candidates] };
	return undefined;
}

import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";

import { PR_TITLE_MAX_CHARS } from "./pr-inventory.ts";

const normalizedPrTitlePrefixBrand: unique symbol = Symbol("NormalizedPrTitlePrefix");

export interface NormalizedPrTitlePrefix {
	readonly value: string;
	readonly [normalizedPrTitlePrefixBrand]: true;
}

export type PrTitlePrefixValidationResult =
	| { ok: true; prefix: NormalizedPrTitlePrefix }
	| { ok: false; reason: string };

export function validatePrTitlePrefix(value: string): PrTitlePrefixValidationResult {
	if (value.includes("\r") || value.includes("\n")) {
		return { ok: false, reason: "must be a single line without CR or LF characters" };
	}
	const normalized = value.trim();
	if (normalized === "") return { ok: false, reason: "must not be empty after trimming" };
	if (normalized.length > PR_TITLE_MAX_CHARS - 2) {
		return {
			ok: false,
			reason: `must be at most ${PR_TITLE_MAX_CHARS - 2} characters so the title has room for a separating space and at least one generated-title character`,
		};
	}
	const prefix = {
		value: normalized,
		[normalizedPrTitlePrefixBrand]: true,
	} satisfies NormalizedPrTitlePrefix;
	return { ok: true, prefix };
}

export function composePrefixedPrTitle(prefix: NormalizedPrTitlePrefix, candidate: string): string {
	if (candidate.length === 0) {
		throw new Error("Cannot compose a PR title prefix with an empty generated candidate title.");
	}
	const candidateMaxLength = PR_TITLE_MAX_CHARS - prefix.value.length - 1;
	const truncatedCandidate = truncateTextHead({
		value: candidate,
		maxChars: candidateMaxLength,
		buildMarker: () => "",
		shouldTrimHead: false,
	});
	return `${prefix.value} ${truncatedCandidate}`;
}

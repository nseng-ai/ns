import { PR_TITLE_MAX_LENGTH } from "./pr-inventory.ts";

declare const normalizedPrTitlePrefixBrand: unique symbol;

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
	if (normalized.length > PR_TITLE_MAX_LENGTH - 2) {
		return {
			ok: false,
			reason: `must be at most ${PR_TITLE_MAX_LENGTH - 2} characters so the title has room for a separating space and at least one generated-title character`,
		};
	}
	return { ok: true, prefix: { value: normalized } as NormalizedPrTitlePrefix };
}

export function composePrefixedPrTitle(prefix: NormalizedPrTitlePrefix, candidate: string): string {
	if (candidate.length === 0) {
		throw new Error("Cannot compose a PR title prefix with an empty generated candidate title.");
	}
	const candidateMaxLength = PR_TITLE_MAX_LENGTH - prefix.value.length - 1;
	return `${prefix.value} ${candidate.slice(0, candidateMaxLength)}`;
}

import type { ReviewFailure, ReviewResult } from "./failures.ts";
import {
	RealReviewCatalogGateway,
	type ReviewCatalogGateway,
	type ReviewSource,
} from "../gateways/review-catalog.ts";
import type { ReviewDefinition } from "./models.ts";
import { reviewsReviewDisplayRole, type ReviewsReviewDisplayRole } from "./review-display.ts";
import { loadParsedReviewDefinition } from "./review-definition-loading.ts";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export interface ReviewSkillEntry {
	readonly surface: string;
	readonly reviewKey: string;
	readonly title: string;
	readonly label: string;
	readonly description: string;
	readonly defaultPrompt: string;
}

export type ReviewSkillDefinitionLoadResult =
	| {
			readonly ok: true;
			readonly entry: ReviewSkillEntry;
			readonly source: ReviewSource;
			readonly definition: ReviewDefinition;
	  }
	| { readonly ok: false; readonly error: ReviewFailure };

export interface LoadReviewSkillEntriesOptions {
	readonly cwd: string;
	readonly reviewCatalog?: ReviewCatalogGateway;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface LoadReviewSkillDefinitionOptions extends LoadReviewSkillEntriesOptions {
	readonly key: string;
}

const ACRONYMS = new Map([
	["dry", "DRY"],
	["python", "Python"],
	["ns", "NS"],
	["typescript", "TypeScript"],
]);

const REVIEW_SKILL_ROLE_TEXT = {
	tripwire: {
		labelPrefix: "Tripwire",
		promptNoun: "tripwire",
	},
	deep_review: {
		labelPrefix: "Review",
		promptNoun: "review",
	},
} as const satisfies Record<
	ReviewsReviewDisplayRole,
	{ readonly labelPrefix: string; readonly promptNoun: string }
>;

export async function loadReviewSkillEntries(
	options: LoadReviewSkillEntriesOptions,
): Promise<ReviewResult<readonly ReviewSkillEntry[]>> {
	const reviewCatalog = options.reviewCatalog ?? new RealReviewCatalogGateway();
	const catalog = await reviewCatalog.listReviewKeys({
		cwd: options.cwd,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (!catalog.ok) return catalog;

	const entries: ReviewSkillEntry[] = [];
	for (const key of catalog.value.keys) {
		const loaded = await loadReviewSkillDefinition({ ...options, reviewCatalog, key });
		if (!loaded.ok) return { ok: false, error: loaded.error };
		entries.push(loaded.entry);
	}
	return { ok: true, value: entries };
}

export async function loadReviewSkillDefinition(
	options: LoadReviewSkillDefinitionOptions,
): Promise<ReviewSkillDefinitionLoadResult> {
	const reviewCatalog = options.reviewCatalog ?? new RealReviewCatalogGateway();
	const loaded = await loadParsedReviewDefinition({
		cwd: options.cwd,
		...(options.signal === undefined ? {} : { signal: options.signal }),
		reviewCatalog,
		key: options.key,
	});
	if (!loaded.ok) return loaded;

	return {
		ok: true,
		entry: reviewSkillEntryFromDefinition(loaded.value.source.key, loaded.value.definition),
		source: loaded.value.source,
		definition: loaded.value.definition,
	};
}

function reviewSkillSurfaceForDefinition(key: string, role: ReviewsReviewDisplayRole): string {
	if (role === "tripwire" && key.endsWith("-tripwire")) return `skill:${key}`;
	return `skill:review-${key}`;
}

export function reviewsRunSurfaceForReviewKey(key: string): string {
	return `reviews:run:${key}`;
}

export function reviewPathForKey(key: string): string {
	return `.ns/reviews/${key}/review.md`;
}

function reviewSkillTitleForDefinition(key: string, role: ReviewsReviewDisplayRole): string {
	const titleKey =
		role === "tripwire" && key.endsWith("-tripwire") ? key.slice(0, -"-tripwire".length) : key;
	const words = titleKey.split(/[/-]/u).filter((word) => word.length > 0);
	return words.map((word, index) => humanizeKeyWord(word, index)).join(" ");
}

function reviewSkillLabel(title: string, role: ReviewsReviewDisplayRole): string {
	return `${REVIEW_SKILL_ROLE_TEXT[role].labelPrefix}: ${title}`;
}

function reviewDefaultPrompt(title: string, role: ReviewsReviewDisplayRole): string {
	return `Run the ${title} ${REVIEW_SKILL_ROLE_TEXT[role].promptNoun} against the current branch changes.`;
}

function reviewSkillEntryFromDefinition(
	key: string,
	definition: ReviewDefinition,
): ReviewSkillEntry {
	const role = reviewsReviewDisplayRole(definition.modelProfile);
	const title = reviewSkillTitleForDefinition(key, role);
	return {
		surface: reviewSkillSurfaceForDefinition(key, role),
		reviewKey: key,
		title,
		label: reviewSkillLabel(title, role),
		description: definition.description,
		defaultPrompt: reviewDefaultPrompt(title, role),
	};
}

function humanizeKeyWord(word: string, index: number): string {
	const lower = word.toLowerCase();
	const acronym = ACRONYMS.get(lower);
	if (acronym !== undefined) return acronym;
	if (index === 0) return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
	return lower;
}

import type { ReviewFailure, ReviewResult } from "./failures.ts";
import {
	RealReviewCatalogGateway,
	type ReviewCatalogGateway,
	type ReviewSource,
} from "../gateways/review-catalog.ts";
import type { ReviewDefinition } from "./models.ts";
import { roasterReviewDisplayRole, type RoasterReviewDisplayRole } from "./review-display.ts";
import { loadParsedReviewDefinition } from "./review-definition-loading.ts";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export interface RoastSkillEntry {
	readonly surface: string;
	readonly reviewKey: string;
	readonly title: string;
	readonly label: string;
	readonly description: string;
	readonly defaultPrompt: string;
}

export type RoastReviewLoadResult =
	| {
			readonly ok: true;
			readonly entry: RoastSkillEntry;
			readonly source: ReviewSource;
			readonly definition: ReviewDefinition;
	  }
	| { readonly ok: false; readonly error: ReviewFailure };

export interface LoadRoastSkillEntriesOptions {
	readonly cwd: string;
	readonly reviewCatalog?: ReviewCatalogGateway;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface LoadRoastReviewDefinitionOptions extends LoadRoastSkillEntriesOptions {
	readonly key: string;
}

const ACRONYMS = new Map([
	["dry", "DRY"],
	["python", "Python"],
	["ns", "NS"],
	["typescript", "TypeScript"],
]);

const ROAST_SKILL_ROLE_TEXT = {
	tripwire: {
		labelPrefix: "Tripwire",
		promptNoun: "tripwire",
	},
	deep_review: {
		labelPrefix: "Roast",
		promptNoun: "roast",
	},
} as const satisfies Record<
	RoasterReviewDisplayRole,
	{ readonly labelPrefix: string; readonly promptNoun: string }
>;

export async function loadRoastSkillEntries(
	options: LoadRoastSkillEntriesOptions,
): Promise<ReviewResult<readonly RoastSkillEntry[]>> {
	const reviewCatalog = options.reviewCatalog ?? new RealReviewCatalogGateway();
	const catalog = await reviewCatalog.listReviewKeys({
		cwd: options.cwd,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (!catalog.ok) return catalog;

	const entries: RoastSkillEntry[] = [];
	for (const key of catalog.value.keys) {
		const loaded = await loadRoastReviewDefinition({ ...options, reviewCatalog, key });
		if (!loaded.ok) return { ok: false, error: loaded.error };
		entries.push(loaded.entry);
	}
	return { ok: true, value: entries };
}

export async function loadRoastReviewDefinition(
	options: LoadRoastReviewDefinitionOptions,
): Promise<RoastReviewLoadResult> {
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
		entry: roastSkillEntryFromDefinition(loaded.value.source.key, loaded.value.definition),
		source: loaded.value.source,
		definition: loaded.value.definition,
	};
}

function roastSkillSurfaceForDefinition(key: string, role: RoasterReviewDisplayRole): string {
	if (role === "tripwire" && key.endsWith("-tripwire")) return `skill:${key}`;
	return `skill:roast-${key}`;
}

export function roasterRunSurfaceForReviewKey(key: string): string {
	return `roaster:run:${key}`;
}

export function roastReviewPathForKey(key: string): string {
	return `.ns/reviews/${key}/review.md`;
}

function roastSkillTitleForDefinition(key: string, role: RoasterReviewDisplayRole): string {
	const titleKey =
		role === "tripwire" && key.endsWith("-tripwire") ? key.slice(0, -"-tripwire".length) : key;
	const words = titleKey.split(/[/-]/u).filter((word) => word.length > 0);
	return words.map((word, index) => humanizeKeyWord(word, index)).join(" ");
}

function roastSkillLabel(title: string, role: RoasterReviewDisplayRole): string {
	return `${ROAST_SKILL_ROLE_TEXT[role].labelPrefix}: ${title}`;
}

function roastDefaultPrompt(title: string, role: RoasterReviewDisplayRole): string {
	return `Run the ${title} ${ROAST_SKILL_ROLE_TEXT[role].promptNoun} against the current branch changes.`;
}

function roastSkillEntryFromDefinition(key: string, definition: ReviewDefinition): RoastSkillEntry {
	const role = roasterReviewDisplayRole(definition.modelProfile);
	const title = roastSkillTitleForDefinition(key, role);
	return {
		surface: roastSkillSurfaceForDefinition(key, role),
		reviewKey: key,
		title,
		label: roastSkillLabel(title, role),
		description: definition.description,
		defaultPrompt: roastDefaultPrompt(title, role),
	};
}

function humanizeKeyWord(word: string, index: number): string {
	const lower = word.toLowerCase();
	const acronym = ACRONYMS.get(lower);
	if (acronym !== undefined) return acronym;
	if (index === 0) return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
	return lower;
}

import type { RoasterFailure, RoasterResult } from "./failures.ts";
import {
	RealReviewCatalogGateway,
	type ReviewCatalogGateway,
	type ReviewSource,
} from "./gateways/review-catalog.ts";
import type { ReviewDefinition } from "./models.ts";
import { roasterReviewDisplayRole } from "./review-display.ts";
import { loadParsedReviewDefinition } from "./review-definition-loading.ts";

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
			readonly type: "ok";
			readonly entry: RoastSkillEntry;
			readonly source: ReviewSource;
			readonly definition: ReviewDefinition;
	  }
	| { readonly type: "error"; readonly error: RoasterFailure };

export interface LoadRoastSkillEntriesOptions {
	readonly cwd: string;
	readonly reviewCatalog?: ReviewCatalogGateway | undefined;
	// optional-undefined-objective: preserve (abort-signal) — AbortSignal forwarded to the review catalog gateway which accepts present-undefined; abort-signal preserve category.
	readonly signal?: AbortSignal | undefined;
}

export interface LoadRoastReviewDefinitionOptions extends LoadRoastSkillEntriesOptions {
	readonly key: string;
}

const ACRONYMS = new Map([
	["dry", "DRY"],
	["python", "Python"],
	["sdl", "SDL"],
	["typescript", "TypeScript"],
]);

export async function loadRoastSkillEntries(
	options: LoadRoastSkillEntriesOptions,
): Promise<RoasterResult<readonly RoastSkillEntry[]>> {
	const reviewCatalog = options.reviewCatalog ?? new RealReviewCatalogGateway();
	const catalog = await reviewCatalog.listReviewKeys({
		cwd: options.cwd,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (catalog.type === "error") return catalog;

	const entries: RoastSkillEntry[] = [];
	for (const key of catalog.value.keys) {
		const loaded = await loadRoastReviewDefinition({ ...options, reviewCatalog, key });
		if (loaded.type === "error") return { type: "error", error: loaded.error };
		entries.push(loaded.entry);
	}
	return { type: "ok", value: entries };
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
	if (loaded.type === "error") return loaded;

	return {
		type: "ok",
		entry: roastSkillEntryFromDefinition(loaded.value.source.key, loaded.value.definition),
		source: loaded.value.source,
		definition: loaded.value.definition,
	};
}

function roastSkillSurfaceForDefinition(key: string, definition: ReviewDefinition): string {
	if (
		roasterReviewDisplayRole(definition.modelProfile) === "tripwire" &&
		key.endsWith("-tripwire")
	) {
		return `skill:${key}`;
	}
	return `skill:roast-${key}`;
}

export function roasterRunSurfaceForReviewKey(key: string): string {
	return `roaster:run:${key}`;
}

export function roastReviewPathForKey(key: string): string {
	return `.sdl/reviews/${key}.md`;
}

function roastSkillTitleForDefinition(key: string, definition: ReviewDefinition): string {
	const titleKey =
		roasterReviewDisplayRole(definition.modelProfile) === "tripwire" && key.endsWith("-tripwire")
			? key.slice(0, -"-tripwire".length)
			: key;
	const words = titleKey.split(/[/-]/u).filter((word) => word.length > 0);
	return words.map((word, index) => humanizeKeyWord(word, index)).join(" ");
}

function roastSkillLabel(title: string, definition: ReviewDefinition): string {
	if (roasterReviewDisplayRole(definition.modelProfile) === "tripwire") return `Tripwire: ${title}`;
	return `Roast: ${title}`;
}

function roastDefaultPrompt(title: string, definition: ReviewDefinition): string {
	if (roasterReviewDisplayRole(definition.modelProfile) === "tripwire") {
		return `Run the ${title} tripwire against the current branch changes.`;
	}
	return `Run the ${title} roast against the current branch changes.`;
}

function roastSkillEntryFromDefinition(key: string, definition: ReviewDefinition): RoastSkillEntry {
	const title = roastSkillTitleForDefinition(key, definition);
	return {
		surface: roastSkillSurfaceForDefinition(key, definition),
		reviewKey: key,
		title,
		label: roastSkillLabel(title, definition),
		description: definition.description,
		defaultPrompt: roastDefaultPrompt(title, definition),
	};
}

function humanizeKeyWord(word: string, index: number): string {
	const lower = word.toLowerCase();
	const acronym = ACRONYMS.get(lower);
	if (acronym !== undefined) return acronym;
	if (index === 0) return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
	return lower;
}

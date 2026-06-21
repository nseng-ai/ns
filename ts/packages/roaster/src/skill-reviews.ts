import type { RoasterFailure, RoasterResult } from "./failures.ts";
import {
	RealReviewCatalogGateway,
	type ReviewCatalogGateway,
	type ReviewSource,
} from "./gateways/review-catalog.ts";
import type { ReviewDefinition } from "./models.ts";
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

function roastSkillSurfaceForReviewKey(key: string): string {
	return `skill:roast-${key}`;
}

export function roasterRunSurfaceForReviewKey(key: string): string {
	return `roaster:run:${key}`;
}

export function roastReviewPathForKey(key: string): string {
	return `reviews/${key}.md`;
}

function roastSkillTitleForKey(key: string): string {
	const words = key.split(/[/-]/u).filter((word) => word.length > 0);
	return words.map((word, index) => humanizeKeyWord(word, index)).join(" ");
}

function roastSkillLabelForKey(key: string): string {
	return `Roast: ${roastSkillTitleForKey(key)}`;
}

function roastDefaultPromptForKey(key: string): string {
	return `Run the ${roastSkillTitleForKey(key)} roast against the current branch changes.`;
}

function roastSkillEntryFromDefinition(key: string, definition: ReviewDefinition): RoastSkillEntry {
	const title = roastSkillTitleForKey(key);
	return {
		surface: roastSkillSurfaceForReviewKey(key),
		reviewKey: key,
		title,
		label: roastSkillLabelForKey(key),
		description: definition.description,
		defaultPrompt: roastDefaultPromptForKey(key),
	};
}

function humanizeKeyWord(word: string, index: number): string {
	const lower = word.toLowerCase();
	const acronym = ACRONYMS.get(lower);
	if (acronym !== undefined) return acronym;
	if (index === 0) return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
	return lower;
}

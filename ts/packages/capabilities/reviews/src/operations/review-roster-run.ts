import { catalogOptions, environmentOptions, type ReviewsRuntime } from "../core/context.ts";
import type { ReviewFailure, ReviewResult } from "../core/failures.ts";
import {
	reviewRosterRunRequestSchema,
	reviewRosterRunResultSchema,
	type LocalDiff,
	type ReviewFinding,
	type ReviewRosterEntry,
	type ReviewRosterProgressEvent,
	type ReviewRosterRunRequest,
	type ReviewRosterRunResult,
	type SourceAttributedFinding,
} from "../core/models.ts";
import { reviewAppliesToPaths } from "../core/review-applicability.ts";
import {
	loadParsedReviewDefinition,
	type ParsedReviewDefinition,
} from "../core/review-definition-loading.ts";
import {
	executePreparedReview,
	loadProjectConfigFromContext,
	resolveDeclarativeReviewModel,
} from "./review-run.ts";

export interface RunReviewRosterOptions {
	readonly onProgress?: (event: ReviewRosterProgressEvent) => void;
}

interface LoadedRosterReview {
	readonly key: string;
	readonly parsed: ReviewResult<ParsedReviewDefinition>;
}

export async function runReviewRoster(
	ctx: ReviewsRuntime,
	request: ReviewRosterRunRequest,
	options: RunReviewRosterOptions = {},
): Promise<ReviewResult<ReviewRosterRunResult>> {
	const parsedRequest = reviewRosterRunRequestSchema.safeParse(request);
	if (!parsedRequest.success)
		return rosterInvalid(parsedRequest.error.issues[0]?.message ?? "Invalid roster request.");

	const config = await loadProjectConfigFromContext(ctx);
	if (!config.ok) return config;
	const diff = await ctx.localDiff.loadDiff({
		...environmentOptions(ctx.runScope),
		selection: { type: "revision-range", revisionRange: parsedRequest.data.revisionRange },
		excludeGlobs: config.value.diff.exclude,
	});
	if (!diff.ok) return diff;
	const catalog = await ctx.reviewCatalog.listReviewKeys(catalogOptions(ctx.runScope));
	if (!catalog.ok) return catalog;

	const loaded: LoadedRosterReview[] = [];
	for (const key of catalog.value.keys) {
		loaded.push({
			key,
			parsed: await loadParsedReviewDefinition({
				...catalogOptions(ctx.runScope),
				reviewCatalog: ctx.reviewCatalog,
				key,
			}),
		});
	}
	const validation = validateRoster(parsedRequest.data.roster, loaded, diff.value);
	if (!validation.ok) return validation;

	const ranAt = new Date(ctx.clock.nowMs()).toISOString();
	const entries: ReviewRosterEntry[] = [];
	const findings: SourceAttributedFinding[] = [];
	for (const [position, selection] of parsedRequest.data.roster.entries()) {
		const review = loaded.find((candidate) => candidate.key === selection.reviewKey);
		if (review === undefined)
			return rosterInvalid(`Unknown review key ${JSON.stringify(selection.reviewKey)}.`);
		// An invalid definition cannot supply semantics to which a selection decision applies.
		// Keep the catalog gap visible as a failed entry even when the supplied flag is false.
		if (review.parsed.ok && !selection.selected) {
			entries.push({ reviewKey: selection.reviewKey, position, state: "toggled-off" });
			continue;
		}
		emitProgress(options, { type: "review-started", reviewKey: selection.reviewKey, position });
		if (!review.parsed.ok) {
			const entry = failedEntry(selection.reviewKey, position, "definition", review.parsed.error);
			entries.push(entry);
			emitProgress(options, {
				type: "review-failed",
				reviewKey: selection.reviewKey,
				position,
				stage: entry.stage,
				error: entry.error,
			});
			continue;
		}
		const resolved = resolveDeclarativeReviewModel(review.parsed.value.definition, config.value);
		if (!resolved.ok) {
			const entry = failedEntry(selection.reviewKey, position, "model-resolution", resolved.error);
			entries.push(entry);
			emitProgress(options, {
				type: "review-failed",
				reviewKey: selection.reviewKey,
				position,
				stage: entry.stage,
				error: entry.error,
			});
			continue;
		}
		const response = await executePreparedReview(ctx, {
			source: review.parsed.value.source,
			definition: review.parsed.value.definition,
			diff: diff.value,
			model: resolved.value.model,
		});
		if (!response.ok) {
			const entry = failedEntry(selection.reviewKey, position, "runner", response.error);
			entries.push(entry);
			emitProgress(options, {
				type: "review-failed",
				reviewKey: selection.reviewKey,
				position,
				stage: entry.stage,
				error: entry.error,
			});
			continue;
		}
		const attributed = attributeFindings(selection.reviewKey, response.value.payload.findings);
		entries.push({
			reviewKey: selection.reviewKey,
			position,
			state: "completed",
			modelProfile: resolved.value.modelProfile,
			model: resolved.value.model,
			findings: attributed,
			usage: response.value.usage,
			inputCoverage: response.value.inputCoverage,
		});
		findings.push(...attributed);
		emitProgress(options, {
			type: "review-completed",
			reviewKey: selection.reviewKey,
			position,
			findingCount: attributed.length,
			inputCoverage: response.value.inputCoverage,
		});
	}

	return {
		ok: true,
		value: reviewRosterRunResultSchema.parse({
			revisionRange: parsedRequest.data.revisionRange,
			ranAt,
			entries,
			findings,
		}),
	};
}

function validateRoster(
	roster: readonly ReviewRosterRunRequest["roster"][number][],
	loaded: readonly LoadedRosterReview[],
	diff: LocalDiff,
): ReviewResult<void> {
	const supplied = new Set<string>();
	for (const entry of roster) {
		if (supplied.has(entry.reviewKey))
			return rosterInvalid(`Duplicate review key ${JSON.stringify(entry.reviewKey)}.`);
		supplied.add(entry.reviewKey);
	}
	const catalogKeys = new Set(loaded.map((review) => review.key));
	for (const key of supplied)
		if (!catalogKeys.has(key)) return rosterInvalid(`Unknown review key ${JSON.stringify(key)}.`);

	const required = new Set<string>();
	for (const review of loaded) {
		if (
			!review.parsed.ok ||
			reviewAppliesToPaths(review.parsed.value.definition.applicability, diff.changedPaths)
		)
			required.add(review.key);
	}
	for (const key of supplied)
		if (!required.has(key))
			return rosterInvalid(
				`Review ${JSON.stringify(key)} is not applicable to the loaded revision range.`,
			);
	for (const key of required)
		if (!supplied.has(key))
			return rosterInvalid(`Roster is incomplete; missing review ${JSON.stringify(key)}.`);
	return { ok: true, value: undefined };
}

function failedEntry(
	reviewKey: string,
	position: number,
	stage: "definition" | "model-resolution" | "runner",
	error: ReviewFailure,
): Extract<ReviewRosterEntry, { state: "failed" }> {
	return {
		reviewKey,
		position,
		state: "failed",
		stage,
		error: { code: error.code, message: error.message },
	};
}

function attributeFindings(
	reviewKey: string,
	reviewFindings: readonly ReviewFinding[],
): SourceAttributedFinding[] {
	const occurrences = new Map<string, number>();
	return reviewFindings.map((finding) => {
		const tuple = JSON.stringify([
			finding.path,
			finding.line,
			finding.severity,
			finding.summary,
			finding.details,
		]);
		const occurrence = occurrences.get(tuple) ?? 0;
		occurrences.set(tuple, occurrence + 1);
		return { reviewKey, ...finding, occurrence };
	});
}

function emitProgress(options: RunReviewRosterOptions, event: ReviewRosterProgressEvent): void {
	try {
		options.onProgress?.(event);
	} catch {
		// Presentation callbacks cannot change reviewer accounting.
	}
}

function rosterInvalid(message: string): ReviewResult<never> {
	return { ok: false, error: { code: "review-roster-invalid", message } };
}

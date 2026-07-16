import type { ReviewAggregationRunnerRequest } from "../core/models.ts";

export function reviewAggregationSystemPrompt(): string {
	return [
		"You aggregate source-attributed review findings into duplicate clusters.",
		"Preserve each complete finding object verbatim; cluster findings but never merge or rewrite them.",
		"Partition every input finding exactly once. Do not omit, duplicate, or invent findings.",
		"Honor every mustGroup and mustSeparate constraint.",
		"Flag recommendationConflict only when member recommendations are incompatible, and explain it.",
		"Choose exactly one proposed disposition per cluster: fix, fix-manually, reject, or defer.",
		"Return only the requested structured output.",
	].join("\n");
}

export function buildReviewAggregationPrompt(request: ReviewAggregationRunnerRequest): string {
	return JSON.stringify(
		{
			revisionRange: request.rosterResult.revisionRange,
			rosterEntries: request.rosterResult.entries,
			findings: request.rosterResult.findings,
			constraints: request.constraints,
			// Project prior state to clusters only: the current roster evidence is
			// already sent top-level, and derived accounting is recomputed after the
			// model returns a corrected proposal.
			...(request.priorResult === undefined
				? {}
				: { priorResult: { clusters: request.priorResult.clusters } }),
		},
		null,
		2,
	);
}

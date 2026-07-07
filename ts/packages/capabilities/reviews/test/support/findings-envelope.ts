import type { ReviewFinding } from "../../src/core/models.ts";
import { reviewPathForKey } from "../../src/core/skill-reviews.ts";

export interface FindingsEnvelopeOptions {
	readonly reviewName?: string;
	readonly reviewPath?: string;
	readonly modelProfile?: string;
	readonly model?: string;
	readonly baseRef?: string;
}

export function buildFindingsEnvelope(
	findings: readonly ReviewFinding[],
	options: FindingsEnvelopeOptions = {},
): string {
	const reviewName = options.reviewName ?? "typescript-style";
	return JSON.stringify({
		status: "ok",
		exitCode: 0,
		data: {
			reviewName,
			reviewPath: options.reviewPath ?? reviewPathForKey(reviewName),
			modelProfile: options.modelProfile ?? "quick",
			model: options.model ?? "haiku",
			baseRef: options.baseRef ?? "main",
			format: "findings",
			count: findings.length,
			findings,
			usage: null,
			inputCoverage: null,
		},
	});
}

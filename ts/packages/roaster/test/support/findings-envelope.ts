import type { ReviewFinding } from "../../src/models.ts";

export interface FindingsEnvelopeOptions {
	readonly reviewName?: string | undefined;
	readonly reviewPath?: string | undefined;
	readonly modelProfile?: string | undefined;
	readonly model?: string | undefined;
	readonly baseRef?: string | undefined;
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
			reviewPath: options.reviewPath ?? `.sdl/reviews/${reviewName}.md`,
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

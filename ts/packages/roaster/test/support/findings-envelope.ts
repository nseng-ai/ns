import type { ReviewFinding } from "../../src/models.ts";

interface SuccessEnvelopeOverrides {
	readonly reviewName?: string;
	readonly reviewPath?: string;
	readonly model?: string;
	readonly baseRef?: string;
}

export function buildSuccessEnvelope(
	findings: readonly ReviewFinding[],
	overrides: SuccessEnvelopeOverrides = {},
): string {
	const reviewName = overrides.reviewName ?? "typescript-style";
	return JSON.stringify({
		exit_code: 0,
		data: {
			reviewName,
			reviewPath: overrides.reviewPath ?? `reviews/${reviewName}.md`,
			model: overrides.model ?? "haiku",
			baseRef: overrides.baseRef ?? "main",
			format: "findings",
			count: findings.length,
			findings,
			usage: null,
			inputCoverage: null,
		},
	});
}

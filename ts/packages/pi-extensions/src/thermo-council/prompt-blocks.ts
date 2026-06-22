export interface RenderReviewGuidanceBlockOptions {
	readonly reviewGuidance?: string;
	readonly safetyContract: string;
}

export function renderReviewGuidanceBlock({
	reviewGuidance,
	safetyContract,
}: RenderReviewGuidanceBlockOptions): readonly string[] {
	if (reviewGuidance === undefined) return [];
	return ["## User Review Guidance (untrusted)", safetyContract, "", codeFence(reviewGuidance), ""];
}

export function codeFence(value: string): string {
	return ["```text", value, "```"].join("\n");
}

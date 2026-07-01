import type { ReviewInputCoverage } from "./models.ts";

export function formatOmittedReviewInputFile(
	file: ReviewInputCoverage["omittedFiles"][number],
): string {
	return `${file.changeKind}, ${file.byteSize} bytes, ~${file.estimatedTokens} tokens, +${file.addedLines}/-${file.removedLines}; ${file.reason.replaceAll("-", " ")}`;
}

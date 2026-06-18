import { estimateTokens } from "../diff-parsing.ts";
import type { HarnessReviewRequest, ReviewInputCoverage } from "../models.ts";

export const MAX_PROMPT_DIFF_TOKENS = 120_000;
export const MAX_PROMPT_DIFF_FILE_TOKENS = 40_000;

export interface PromptSizedDiffResult {
	readonly diffText: string;
	readonly inputCoverage: ReviewInputCoverage;
}

export function promptSizedDiff(
	localDiff: HarnessReviewRequest["target"]["localDiff"],
): PromptSizedDiffResult {
	const fullDiffEstimatedTokens = estimateTokens(localDiff.diffText);
	const omittedFiles: ReviewInputCoverage["omittedFiles"] = [];
	const includedRawTexts: string[] = [];
	let includedTokens = 0;
	let includedFileCount = 0;

	for (const file of localDiff.files) {
		if (file.estimatedTokens > MAX_PROMPT_DIFF_FILE_TOKENS) {
			omittedFiles.push(omittedReviewInputFile(file, "file_exceeds_cap"));
			continue;
		}
		if (includedTokens + file.estimatedTokens > MAX_PROMPT_DIFF_TOKENS) {
			omittedFiles.push(omittedReviewInputFile(file, "diff_budget_exhausted"));
			continue;
		}
		includedRawTexts.push(file.rawText);
		includedTokens += file.estimatedTokens;
		includedFileCount += 1;
	}

	const inputCoverage = {
		fullDiffEstimatedTokens,
		promptDiffTokenCap: MAX_PROMPT_DIFF_TOKENS,
		promptDiffFileTokenCap: MAX_PROMPT_DIFF_FILE_TOKENS,
		changedPathCount: localDiff.changedPaths.length,
		includedFileCount,
		omittedFileCount: omittedFiles.length,
		omittedFiles,
	} satisfies ReviewInputCoverage;

	if (omittedFiles.length === 0 && fullDiffEstimatedTokens <= MAX_PROMPT_DIFF_TOKENS) {
		return { diffText: localDiff.diffText, inputCoverage };
	}

	const header = buildCappedDiffHeader(inputCoverage);
	const body = includedRawTexts.join("");
	return { diffText: body.length === 0 ? header.trimEnd() : `${header}\n${body}`, inputCoverage };
}

function omittedReviewInputFile(
	file: HarnessReviewRequest["target"]["localDiff"]["files"][number],
	reason: ReviewInputCoverage["omittedFiles"][number]["reason"],
): ReviewInputCoverage["omittedFiles"][number] {
	return {
		path: file.path.trim() === "" ? "(unknown path)" : file.path,
		changeKind: file.changeKind,
		byteSize: file.byteSize,
		estimatedTokens: file.estimatedTokens,
		addedLines: file.addedLines,
		removedLines: file.removedLines,
		reason,
	};
}

function buildCappedDiffHeader(coverage: ReviewInputCoverage): string {
	const lines = [
		"# Roaster note: diff input was capped before sending to the review model.",
		`# Full diff estimate: ~${coverage.fullDiffEstimatedTokens} tokens; prompt diff cap: ${coverage.promptDiffTokenCap} tokens; per-file cap: ${coverage.promptDiffFileTokenCap} tokens.`,
		"# Omitted file diffs:",
		...coverage.omittedFiles.map(
			(file) =>
				`# - ${file.path} (${file.changeKind}, ${file.byteSize} bytes, ~${file.estimatedTokens} tokens, +${file.addedLines}/-${file.removedLines}; ${file.reason.replaceAll("_", " ")})`,
		),
		"# Included file diffs follow.",
	];
	return lines.join("\n");
}

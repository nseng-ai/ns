import { estimateTokens } from "../core/diff-parsing.ts";
import { formatOmittedReviewInputFile } from "../core/input-coverage-formatting.ts";
import {
	joinDiffFileRawText,
	type ReviewRunnerRequest,
	type ReviewInputCoverage,
} from "../core/models.ts";

export const MAX_PROMPT_DIFF_TOKENS = 90_000;
export const MAX_PROMPT_DIFF_FILE_TOKENS = 40_000;

export interface PromptSizedDiffResult {
	readonly diffText: string;
	readonly inputCoverage: ReviewInputCoverage;
}

export function promptSizedDiff(
	localDiff: ReviewRunnerRequest["target"]["localDiff"],
): PromptSizedDiffResult {
	const fullDiffEstimatedTokens = estimateTokens(localDiff.diffText);
	const omittedFiles: ReviewInputCoverage["omittedFiles"] = [];
	const includedFiles: Array<ReviewRunnerRequest["target"]["localDiff"]["files"][number]> = [];
	let includedTokens = 0;

	for (const file of localDiff.files) {
		if (file.estimatedTokens > MAX_PROMPT_DIFF_FILE_TOKENS) {
			omittedFiles.push(omittedReviewInputFile(file, "file-exceeds-cap"));
			continue;
		}
		if (includedTokens + file.estimatedTokens > MAX_PROMPT_DIFF_TOKENS) {
			omittedFiles.push(omittedReviewInputFile(file, "diff-budget-exhausted"));
			continue;
		}
		includedFiles.push(file);
		includedTokens += file.estimatedTokens;
	}

	const inputCoverage = {
		fullDiffEstimatedTokens,
		promptDiffTokenCap: MAX_PROMPT_DIFF_TOKENS,
		promptDiffFileTokenCap: MAX_PROMPT_DIFF_FILE_TOKENS,
		changedPathCount: localDiff.changedPaths.length,
		includedFileCount: includedFiles.length,
		omittedFileCount: omittedFiles.length,
		omittedFiles,
	} satisfies ReviewInputCoverage;

	if (omittedFiles.length === 0 && fullDiffEstimatedTokens <= MAX_PROMPT_DIFF_TOKENS) {
		return { diffText: localDiff.diffText, inputCoverage };
	}

	const header = buildCappedDiffHeader(inputCoverage);
	const body = joinDiffFileRawText(includedFiles);
	return { diffText: body.length === 0 ? header.trimEnd() : `${header}\n${body}`, inputCoverage };
}

function omittedReviewInputFile(
	file: ReviewRunnerRequest["target"]["localDiff"]["files"][number],
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
		"# Reviews note: diff input was capped before sending to the review model.",
		`# Full diff estimate: ~${coverage.fullDiffEstimatedTokens} tokens; prompt diff cap: ${coverage.promptDiffTokenCap} tokens; per-file cap: ${coverage.promptDiffFileTokenCap} tokens.`,
		"# Omitted file diffs:",
		...coverage.omittedFiles.map(
			(file) => `# - ${file.path} (${formatOmittedReviewInputFile(file)})`,
		),
		"# Included file diffs follow.",
	];
	return lines.join("\n");
}

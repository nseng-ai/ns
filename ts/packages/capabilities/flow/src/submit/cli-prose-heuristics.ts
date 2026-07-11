// This module is the only permitted home for matching human-facing git, Graphite, and GitHub CLI prose.

import type { ExecResult } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";

export function isRestackNeededProse(output: string): boolean {
	const strippedOutput = stripAndNormalizeNewlines(output);
	const mentionsRestack = /\brestack(?:ed|ing)?\b/i.test(strippedOutput);
	const requiresRestackBeforeSubmit =
		/before submit(?:ting|sion)?/i.test(strippedOutput) ||
		/need(?:s|ed)? to be restacked/i.test(strippedOutput) ||
		/must be restacked/i.test(strippedOutput) ||
		/requires? (?:a )?restack/i.test(strippedOutput) ||
		/restack (?:is )?required/i.test(strippedOutput);

	return mentionsRestack && requiresRestackBeforeSubmit;
}

export function isTrunkOutOfDateProse(output: string): boolean {
	return /trunk branch is out of date and could not be updated/i.test(stripTerminalEscapes(output));
}

export function isMergedPrNotInTrunkProse(output: string): boolean {
	return /already been merged but the merged commits are not contained in the latest trunk branch/i.test(
		stripTerminalEscapes(output),
	);
}

export function isGraphitePrInfoLookupFailureProse(output: string): boolean {
	const strippedOutput = stripAndNormalizeNewlines(output);
	return /Failed to get pull request info\. Please try again\./i.test(strippedOutput);
}

export function matchRemoteUpdatedOutsideGraphite(
	output: string,
): { branchName?: string } | undefined {
	const match = stripTerminalEscapes(output).match(
		/Branch\s+(?<branch>\S+)\s+has been updated remotely outside of Graphite/iu,
	);
	if (match === null) return undefined;
	return {
		...optionalEntry("branchName", match.groups?.branch),
	};
}

export function matchSubmitEmptyBranch(output: string): { branchName?: string } | undefined {
	const strippedOutput = stripAndNormalizeNewlines(output);
	const emptyBranchWarning = /This branch does not introduce any changes:/i.test(strippedOutput);
	const skippedSubmissionWarning =
		/will not be submitted/i.test(strippedOutput) ||
		/GitHub does not allow empty PRs/i.test(strippedOutput);

	if (!emptyBranchWarning || !skippedSubmissionWarning) return undefined;
	const branchName =
		parseSubmitEmptyBranchWarningBranchName(strippedOutput) ??
		parseSubmitValidationBranchName(strippedOutput);
	return {
		...optionalEntry("branchName", branchName),
	};
}

export function parseSubmitEmptyBranchWarningBranchName(output: string): string | undefined {
	return output.match(
		/This branch does not introduce any changes:\s*\n\s*▸\s*(?<branch>\S+)\s*(?:\n|$)/iu,
	)?.groups?.branch;
}

export function parseSubmitValidationBranchName(output: string): string | undefined {
	const validationBlock = output.match(
		/Validating that this Graphite stack is ready to submit\.\.\.(?<block>[\s\S]*?)(?:\n\s*📝|\n\s*WARNING:|$)/u,
	)?.groups?.block;
	if (validationBlock === undefined) return undefined;

	for (const line of validationBlock.split("\n")) {
		const match = line.match(/^\s*▸\s*(?<branch>\S+)\s*$/u);
		const branch = match?.groups?.branch;
		if (branch !== undefined) return branch;
	}
	return undefined;
}

export function combinedCommandOutput(result: ExecResult): string {
	return `${result.stderr}\n${result.stdout}`;
}

export function isLikelyInProgressGitOperationFailure(result: ExecResult): boolean {
	return isLikelyInProgressGitOperationOutput(combinedCommandOutput(result));
}

export function isLikelyInProgressGitOperationOutput(output: string): boolean {
	return isGitRebaseInProgressOutput(output) || isGitConflictOutput(output);
}

export function isGitRebaseInProgressOutput(output: string): boolean {
	const strippedOutput = strippedLowerOutput(output);
	return [
		"git rebase --continue",
		"git rebase --abort",
		"rebase in progress",
		"you are currently rebasing",
		"interactive rebase in progress",
		"could not apply",
		"patch failed",
	].some((needle) => strippedOutput.includes(needle));
}

export function isGitConflictOutput(output: string): boolean {
	const strippedOutput = strippedLowerOutput(output);
	return [
		"fix conflicts and then run",
		"resolve all conflicts manually",
		"resolve conflicts",
		"unmerged paths",
		"conflict (",
		"conflict:",
		"merge conflict",
	].some((needle) => strippedOutput.includes(needle));
}

export function detectGitConflictOutput(
	output: string,
	conflictedFiles: readonly string[] = [],
): boolean {
	return conflictedFiles.length > 0 || isGitConflictOutput(output);
}

export function isNoCurrentPrProse(output: string): boolean {
	return /No PR found/i.test(stripTerminalEscapes(output));
}

export function isGithubDiffTooLargeProse(output: string): boolean {
	return /diff exceeded the maximum number of lines|PullRequest\.diff too_large|HTTP 406/i.test(
		output,
	);
}

function stripAndNormalizeNewlines(output: string): string {
	return stripTerminalEscapes(output).replace(/\r/g, "\n");
}

function strippedLowerOutput(output: string): string {
	return stripTerminalEscapes(output).toLowerCase();
}

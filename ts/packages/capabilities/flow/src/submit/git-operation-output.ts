import { stripTerminalEscapes } from "@ns/core/terminal-escapes";
import type { ExecResult } from "@ns/core/command";

export function combinedGitCommandOutput(result: ExecResult): string {
	return `${result.stderr}\n${result.stdout}`;
}

export function isLikelyInProgressGitOperationFailure(result: ExecResult): boolean {
	return isLikelyInProgressGitOperationOutput(combinedGitCommandOutput(result));
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

function strippedLowerOutput(output: string): string {
	return stripTerminalEscapes(output).toLowerCase();
}

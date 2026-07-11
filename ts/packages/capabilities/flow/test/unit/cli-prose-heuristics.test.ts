import { describe, expect, test } from "vitest";

import {
	isGitConflictProse,
	isGitConflictWithConflictedFilesProse,
	isGithubDiffTooLargeFailure,
	isGithubDiffTooLargeProse,
	isGitRebaseInProgressProse,
	isNoCurrentPrProse,
} from "../../src/submit/cli-prose-heuristics.ts";

describe("CLI prose heuristics", () => {
	test.each(["No PR found", "ERROR: no pr FOUND for the current branch"])(
		"detects Graphite's no-current-PR prose: %s",
		(output) => {
			expect(isNoCurrentPrProse(output)).toBe(true);
		},
	);

	test.each([
		"diff exceeded the maximum number of lines",
		"PullRequest.diff too_large",
		"HTTP 406",
	])("detects GitHub's diff-too-large prose: %s", (output) => {
		expect(isGithubDiffTooLargeProse(output)).toBe(true);
	});

	test("classifies a usable exit-1 GitHub diff-too-large failure", () => {
		expect(
			isGithubDiffTooLargeFailure({
				type: "exited",
				stdout: "",
				stderr: "HTTP 406",
				code: 1,
				signal: null,
			}),
		).toBe(true);
		expect(
			isGithubDiffTooLargeFailure({
				type: "exited",
				stdout: "",
				stderr: "HTTP 406",
				code: 2,
				signal: null,
			}),
		).toBe(false);
		expect(
			isGithubDiffTooLargeFailure({
				type: "exited",
				stdout: "",
				stderr: "HTTP 406",
				code: 1,
				signal: "SIGTERM",
			}),
		).toBe(false);
	});

	test.each([
		"git rebase --continue",
		"git rebase --abort",
		"rebase in progress",
		"you are currently rebasing",
		"interactive rebase in progress",
		"could not apply",
		"patch failed",
	])("detects Git rebase-in-progress prose: %s", (output) => {
		expect(isGitRebaseInProgressProse(output)).toBe(true);
	});

	test.each([
		"fix conflicts and then run",
		"resolve all conflicts manually",
		"resolve conflicts",
		"unmerged paths",
		"conflict (content)",
		"conflict: file.ts",
		"merge conflict",
	])("detects Git conflict prose: %s", (output) => {
		expect(isGitConflictProse(output)).toBe(true);
	});

	test("classifies conflicted files even without conflict prose", () => {
		expect(isGitConflictWithConflictedFilesProse("", ["conflicted.ts"])).toBe(true);
	});
});

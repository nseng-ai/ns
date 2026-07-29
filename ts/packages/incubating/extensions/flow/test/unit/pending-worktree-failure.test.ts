import { describe, expect, test } from "vitest";

import { pendingWorktreeFailureFacts } from "../../src/checkpoint/pending-worktree-failure.ts";

describe("pending worktree failure facts", () => {
	test.each([
		[
			"not_git_repo",
			{
				plainMessage: "Not inside a git repository.",
				gitCommand: "git rev-parse --show-toplevel",
				headline: "Not inside a git repository.",
			},
		],
		[
			"detached_head",
			{
				plainMessage: "Could not determine current branch.",
				gitCommand: "git symbolic-ref --short HEAD",
				headline: "Could not determine the current branch.",
			},
		],
		[
			"status_failed",
			{
				plainMessage: "Could not inspect git status.",
				gitCommand: "git status --porcelain=v1",
				headline: "Could not inspect the worktree status.",
			},
		],
		[
			"diff_failed",
			{
				plainMessage: "Could not capture git diff.",
				gitCommand: "git diff HEAD --no-ext-diff",
				headline: "Could not capture the worktree diff.",
			},
		],
	] as const)("projects %s semantics", (kind, expected) => {
		expect(pendingWorktreeFailureFacts(kind)).toEqual(expected);
	});
});

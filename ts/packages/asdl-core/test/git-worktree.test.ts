import { describe, expect, test } from "vitest";

import { parseGitWorktreePorcelain, planLocalBranchRefreshFromWorktrees } from "@asdl/core/git";

describe("parseGitWorktreePorcelain", () => {
	test("parses git worktree porcelain records", () => {
		expect(
			parseGitWorktreePorcelain(
				[
					"worktree /repo",
					"HEAD 1111111111111111111111111111111111111111",
					"branch refs/heads/feature-a",
					"",
					"worktree /detached",
					"HEAD 2222222222222222222222222222222222222222",
					"detached",
				].join("\n"),
			),
		).toEqual([
			{ path: "/repo", branch: "feature-a" },
			{ path: "/detached", branch: null },
		]);
	});
});

describe("planLocalBranchRefreshFromWorktrees", () => {
	test("plans a pull in the checked-out branch worktree", () => {
		expect(
			planLocalBranchRefreshFromWorktrees({
				branch: "master",
				cwd: "/repo",
				worktreePorcelain: [
					"worktree /repo",
					"HEAD 1111111111111111111111111111111111111111",
					"branch refs/heads/feature-a",
					"",
					"worktree /trunk",
					"HEAD 2222222222222222222222222222222222222222",
					"branch refs/heads/master",
				].join("\n"),
			}),
		).toEqual({
			type: "pull-checked-out-branch",
			cwd: "/trunk",
			args: ["pull", "--ff-only", "origin", "master"],
		});
	});

	test("plans a fetch into the local branch when it is not checked out", () => {
		expect(
			planLocalBranchRefreshFromWorktrees({
				branch: "main",
				cwd: "/repo",
				worktreePorcelain:
					"worktree /repo\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/feature-a\n",
			}),
		).toEqual({
			type: "fetch-local-branch",
			cwd: "/repo",
			args: ["fetch", "origin", "refs/heads/main:refs/heads/main"],
		});
	});
});

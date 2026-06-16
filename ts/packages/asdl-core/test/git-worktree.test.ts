import { describe, expect, test } from "vitest";

import { parseGitWorktreePorcelain } from "@asdl/core/git";

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

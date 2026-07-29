import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import { resolveRepoTrunkBranch } from "../src/core/trunk-branch.ts";

describe("resolveRepoTrunkBranch", () => {
	test("resolves the cached origin/HEAD branch with the supplied cwd", async () => {
		const git = new InMemoryGitGateway({ cachedOriginHeadBranch: "master" });

		await expect(resolveRepoTrunkBranch(git, { cwd: "/repo" })).resolves.toEqual({
			type: "resolved",
			branch: "master",
		});
		expect(git.cachedOriginHeadBranchCalls).toEqual([{ cwd: "/repo" }]);
	});

	test("fails actionably when refs/remotes/origin/HEAD is not set locally", async () => {
		const git = new InMemoryGitGateway({ cachedOriginHeadBranch: { type: "missing" } });

		const resolution = await resolveRepoTrunkBranch(git, { cwd: "/repo" });

		expect(resolution.type).toBe("failed");
		if (resolution.type !== "failed") throw new Error("Expected a failed resolution.");
		expect(resolution.message).toContain("refs/remotes/origin/HEAD is not set locally");
		expect(resolution.message).toContain("git remote set-head origin --auto");
	});

	test("preserves the git failure message on lookup errors", async () => {
		const git = new InMemoryGitGateway({
			cachedOriginHeadBranch: {
				type: "failure",
				error: { code: "trunk-branch-failed", message: "git symbolic-ref for origin HEAD failed" },
			},
		});

		const resolution = await resolveRepoTrunkBranch(git, { cwd: "/repo" });

		expect(resolution).toEqual({
			type: "failed",
			message:
				"Could not determine the repository trunk branch. git symbolic-ref for origin HEAD failed",
		});
	});
});

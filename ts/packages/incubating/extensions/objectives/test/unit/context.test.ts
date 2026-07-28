import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import { createRealObjectiveContext } from "../../src/core/context.ts";

describe("Objective context trunk resolution", () => {
	test("uses the resolved branch without an implicit main fallback", async () => {
		const context = await createRealObjectiveContext({
			cwd: "/repo",
			git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", trunkBranch: "develop" }),
		});

		expect(context.trunkBranch).toBe("develop");
	});

	test("propagates an actionable trunk resolution failure", async () => {
		await expect(
			createRealObjectiveContext({
				cwd: "/repo",
				git: new InMemoryGitGateway({
					optionalRepoRoot: "/repo",
					trunkBranch: {
						type: "cached-remote-head-missing",
						remote: "upstream",
						remoteHeadRef: "refs/remotes/upstream/HEAD",
					},
				}),
			}),
		).rejects.toThrow(
			"`refs/remotes/upstream/HEAD` is missing. Fetch remote `upstream`, or configure [git].trunk in ns.toml.",
		);
	});
});

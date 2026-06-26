import { expect, test } from "vitest";

import { createTempGitRepo } from "@sdl/core/testing";

test("temp git repo helper initializes a committed main branch", () => {
	const repo = createTempGitRepo({ prefix: "sdl-core-testing-git-" });
	try {
		expect(repo.runGit(["branch", "--show-current"])).toBe("main\n");
		expect(repo.runGit(["status", "--porcelain"])).toBe("");
		expect(repo.runGit(["log", "-1", "--format=%s"])).toBe("initial\n");
	} finally {
		repo.cleanup();
	}
});

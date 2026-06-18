import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RealBrmemPromptResolver } from "../../src/prompt-resolution.ts";
import { createTempGitRepo } from "../support/temp-git-repo.ts";

describe("RealBrmemPromptResolver", () => {
	it("resolves the repository root and checks prompt existence in a throwaway repository", async () => {
		const repo = createTempGitRepo();
		try {
			const promptPath = join(repo.path, ".brmem", "prompts", "foo.md");
			mkdirSync(join(repo.path, ".brmem", "prompts"), { recursive: true });
			writeFileSync(promptPath, "prompt\n", "utf8");

			const resolver = new RealBrmemPromptResolver({
				env: { ...process.env, HOME: "/tmp/brmem-home" },
			});
			expect(await resolver.repositoryRoot({ cwd: repo.path })).toEqual({
				type: "ok",
				value: realpathSync(repo.path),
			});
			expect(resolver.homeRoot()).toBe("/tmp/brmem-home");
			expect(await resolver.fileExists(promptPath)).toBe(true);
			expect(await resolver.fileExists(join(repo.path, ".brmem", "prompts", "missing.md"))).toBe(
				false,
			);
		} finally {
			repo.cleanup();
		}
	});

	it("returns not-a-git-repo outside a checkout", async () => {
		const resolver = new RealBrmemPromptResolver({ env: process.env });
		const result = await resolver.repositoryRoot({ cwd: "/" });
		expect(result).toMatchObject({ type: "error", error: { code: "not-a-git-repo" } });
		if (result.type === "error")
			expect(result.error.message).toContain("Not inside a git repository");
	});
});

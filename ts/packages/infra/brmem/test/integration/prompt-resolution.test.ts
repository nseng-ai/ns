import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RealBrmemPromptResolver } from "../../src/prompt-resolution.ts";
import { createTempGitRepo } from "@sdl/capability-kit/git/testing";

describe("RealBrmemPromptResolver integration", () => {
	it("resolves the repository root and checks prompt existence in a throwaway repository", async () => {
		const repo = createTempGitRepo();
		try {
			const promptPath = join(repo.path, ".sdl", "prompts", "foo.md");
			mkdirSync(join(repo.path, ".sdl", "prompts"), { recursive: true });
			writeFileSync(promptPath, "prompt\n", "utf8");

			const resolver = new RealBrmemPromptResolver({
				env: { ...process.env, HOME: "/tmp/brmem-home", XDG_CONFIG_HOME: undefined },
			});
			expect(await resolver.repositoryRoot({ cwd: repo.path })).toEqual({
				type: "ok",
				value: realpathSync(repo.path),
			});
			expect(resolver.globalPromptRoots()).toEqual(["/tmp/brmem-home/.config/sdl/brmem/prompts"]);
			expect(await resolver.fileExists(promptPath)).toBe(true);
			expect(await resolver.fileExists(join(repo.path, ".sdl", "prompts", "missing.md"))).toBe(
				false,
			);
		} finally {
			repo.cleanup();
		}
	});
});

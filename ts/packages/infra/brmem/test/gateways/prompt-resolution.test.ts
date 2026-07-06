import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GitErrorInfo } from "@nseng-ai/capability-kit/git";
import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import { describe, expect, it } from "vitest";

import { RealBrmemPromptResolver } from "../../src/prompt-resolution.ts";

describe("RealBrmemPromptResolver", () => {
	it("resolves repository roots through an injected GitGateway and checks prompt existence", async () => {
		const root = await mkdtemp(join(tmpdir(), "brmem-prompt-test-"));
		try {
			const promptPath = join(root, ".ns", "prompts", "foo.md");
			mkdirSync(join(root, ".ns", "prompts"), { recursive: true });
			writeFileSync(promptPath, "prompt\n", "utf8");
			const git = new InMemoryGitGateway({ repoRoot: root });
			const resolver = new RealBrmemPromptResolver({
				env: { ...process.env, HOME: "/tmp/brmem-home", XDG_CONFIG_HOME: undefined },
				git,
			});

			expect(await resolver.repositoryRoot({ cwd: "/work" })).toEqual({
				type: "ok",
				value: root,
			});
			expect(git.repoRootCalls).toEqual([{ cwd: "/work" }]);
			expect(resolver.globalPromptRoots()).toEqual(["/tmp/brmem-home/.config/ns/brmem/prompts"]);
			expect(await resolver.fileExists(promptPath)).toBe(true);
			expect(await resolver.fileExists(join(root, ".ns", "prompts", "missing.md"))).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("maps injected GitGateway repo-root failures to not-a-git-repo", async () => {
		const gitError: GitErrorInfo = {
			code: "repo-root-failed",
			message: "git failed",
			displayCommand: "git rev-parse --show-toplevel",
		};
		const resolver = new RealBrmemPromptResolver({
			env: process.env,
			git: new InMemoryGitGateway({ repoRoot: { type: "failure", error: gitError } }),
		});

		const result = await resolver.repositoryRoot({ cwd: "/outside" });

		expect(result).toMatchObject({
			type: "error",
			error: {
				code: "not-a-git-repo",
				displayCommand: "git rev-parse --show-toplevel",
			},
		});
		if (result.type === "error")
			expect(result.error.message).toContain("Not inside a git repository: /outside");
	});
});

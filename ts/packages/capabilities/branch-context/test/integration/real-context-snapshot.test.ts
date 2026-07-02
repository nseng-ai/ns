import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BRANCH_CONTEXT_NAMESPACE } from "../../src/core/constants.ts";
import { createRealBranchContextContext } from "../../src/core/context.ts";

// git's canonical empty-tree object. A snapshot tree that resolves to this SHA is
// the exact corruption signature produced when `git mktree` receives empty stdin
// (the bug this test locks down): the executor must actually pipe stdin so the
// built tree is non-empty.
const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

interface TempGitRepo {
	path: string;
	runGit: (args: readonly string[]) => string;
	cleanup: () => void;
}

function createTempGitRepo(): TempGitRepo {
	const path = mkdtempSync(join(tmpdir(), "branch-context-ts-test-"));
	const runGit = (args: readonly string[]): string => {
		const result = spawnSync("git", [...args], { cwd: path, encoding: "utf8" });
		if (result.status !== 0) {
			throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
		}
		return result.stdout;
	};
	runGit(["init", "-b", "main"]);
	runGit(["config", "user.email", "branch-context-test@example.com"]);
	runGit(["config", "user.name", "branch-context Test"]);
	writeFileSync(join(path, "README.md"), "test repo\n", "utf8");
	runGit(["add", "README.md"]);
	runGit(["commit", "-m", "initial"]);
	return { path, runGit, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

describe("createRealBranchContextContext snapshot wiring", () => {
	it("writes a non-empty snapshot tree and round-trips the plan content", async () => {
		const repo = createTempGitRepo();
		try {
			const context = createRealBranchContextContext({ cwd: repo.path });
			const planContent = "# Plan\n\nReal snapshot wiring regression body.\n";

			const put = await context.brmem.putEntry({
				namespace: BRANCH_CONTEXT_NAMESPACE,
				branch: "feat/real-wiring",
				key: "plan.md",
				content: planContent,
			});

			expect(put).toMatchObject({ type: "ok" });
			if (put.type !== "ok") throw new Error("expected put to succeed");

			// The built snapshot tree must not be the empty tree (the empty-stdin
			// failure mode), and it must actually contain the written entry.
			const treeSha = repo.runGit(["rev-parse", `${put.value.commitSha}^{tree}`]).trim();
			expect(treeSha).not.toBe(EMPTY_TREE_SHA);
			expect(repo.runGit(["ls-tree", "-r", "--name-only", put.value.commitSha])).toContain(
				"plan.md",
			);

			const read = await context.brmem.getEntry({
				namespace: BRANCH_CONTEXT_NAMESPACE,
				branch: "feat/real-wiring",
				key: "plan.md",
			});

			expect(read).toMatchObject({ type: "found", value: { content: planContent } });
		} finally {
			repo.cleanup();
		}
	});
});

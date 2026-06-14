import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";
import { createTempGitRepo, type TempGitRepo } from "../support/temp-git-repo.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

interface PythonBrmemResult {
	status: number;
	stdout: string;
	stderr: string;
}

function runPythonBrmem(repo: TempGitRepo, args: readonly string[]): PythonBrmemResult {
	const result = spawnSync("uv", ["run", "--project", REPO_ROOT, "brmem", ...args], {
		cwd: repo.path,
		encoding: "utf8",
	});
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? result.error?.message ?? "",
	};
}

function expectPythonOk(result: PythonBrmemResult): void {
	expect(result.status, result.stderr || result.stdout).toBe(0);
}

function writeRepoFile(repo: TempGitRepo, relativePath: string, content: string): string {
	const path = join(repo.path, relativePath);
	writeFileSync(path, content, "utf8");
	return path;
}

describe("Python and TypeScript brmem storage parity", () => {
	it("TypeScript reads Python-written Base, named, and nested Entries", async () => {
		const repo = createTempGitRepo();
		try {
			expectPythonOk(runPythonBrmem(repo, ["put", "scratch.md", "--branch", "feat/x", "--file", writeRepoFile(repo, "base.txt", "base content\n")]));
			expectPythonOk(
				runPythonBrmem(repo, [
					"put",
					"plans/plan.md",
					"--namespace",
					"branch-context",
					"--branch",
					"feat/x",
					"--file",
					writeRepoFile(repo, "plan.txt", "attached plan\n"),
				]),
			);

			const gateway = new RealGitBrmemGateway(repo.path);
			expect(await gateway.getEntry({ namespace: "base", branch: "feat/x", key: "scratch.md" })).toMatchObject({
				type: "found",
				value: { content: "base content\n" },
			});
			expect(await gateway.getEntry({ namespace: "branch-context", branch: "feat/x", key: "plans/plan.md" })).toMatchObject({
				type: "found",
				value: { content: "attached plan\n" },
			});
			const entries = await gateway.listAllEntries({ branch: "feat/x" });
			if (entries.type !== "ok") throw new Error(entries.error.message);
			expect(entries.value.map((entry) => `${entry.namespace}:${entry.key}:${entry.branch}`)).toEqual([
				"base:scratch.md:feat/x",
				"branch-context:plans/plan.md:feat/x",
			]);
		} finally {
			repo.cleanup();
		}
	});

	it("Python reads TypeScript-written workflow Namespace Entries", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect((await gateway.putEntry({ namespace: "handoff", branch: "feat/x", key: "resume.md", content: "continue here\n" })).type).toBe("ok");
			expect((await gateway.putEntry({ namespace: "branch-context", branch: "feat/x", key: "plan.md", content: "implementation plan\n" })).type).toBe("ok");

			const handoffGet = runPythonBrmem(repo, ["get", "resume.md", "--namespace", "handoff", "--branch", "feat/x"]);
			expectPythonOk(handoffGet);
			expect(handoffGet.stdout).toBe("continue here\n");

			const check = runPythonBrmem(repo, ["check", "plan.md", "--namespace", "branch-context", "--branch", "feat/x", "--format", "json"]);
			expectPythonOk(check);
			expect(JSON.parse(check.stdout)).toMatchObject({
				exit_code: 0,
				data: { namespace: "branch-context", key: "plan.md", branch: "feat/x", ref_name: "refs/brmem/ns/branch-context/feat---x:plan.md", size_bytes: 20 },
			});
		} finally {
			repo.cleanup();
		}
	});

	it("TypeScript key-glob copy preserves Python-readable nonmatching destination Entries", async () => {
		const repo = createTempGitRepo();
		try {
			expectPythonOk(runPythonBrmem(repo, ["put", "slug/body.md", "--branch", "source", "--file", writeRepoFile(repo, "source-body.txt", "source body\n")]));
			expectPythonOk(runPythonBrmem(repo, ["put", "slug/nested/notes.md", "--branch", "source", "--file", writeRepoFile(repo, "source-notes.txt", "source notes\n")]));
			expectPythonOk(runPythonBrmem(repo, ["put", "keep.md", "--branch", "dest", "--file", writeRepoFile(repo, "keep.txt", "keep\n")]));
			expectPythonOk(runPythonBrmem(repo, ["put", "slug/body.md", "--branch", "dest", "--file", writeRepoFile(repo, "dest-body.txt", "old body\n")]));

			const gateway = new RealGitBrmemGateway(repo.path);
			expect((await gateway.copyEntries({ namespace: "base", fromBranch: "source", toBranch: "dest", shouldOverwrite: false, keyGlob: "slug/*" })).type).toBe("error");
			expect((await gateway.copyEntries({ namespace: "base", fromBranch: "source", toBranch: "dest", shouldOverwrite: true, keyGlob: "slug/*" })).type).toBe("ok");

			const keep = runPythonBrmem(repo, ["get", "keep.md", "--branch", "dest"]);
			expectPythonOk(keep);
			expect(keep.stdout).toBe("keep\n");
			const nested = runPythonBrmem(repo, ["get", "slug/nested/notes.md", "--branch", "dest"]);
			expectPythonOk(nested);
			expect(nested.stdout).toBe("source notes\n");
		} finally {
			repo.cleanup();
		}
	});
});

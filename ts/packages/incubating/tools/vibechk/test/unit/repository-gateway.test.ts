import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import {
	exitedResult,
	ScriptedCommandExecApi,
	spawnFailedResult,
} from "@nseng-ai/foundation/exec/testing";
import { describe, expect, it } from "vitest";

import { RealVibechkWorkdirGateway } from "../../src/repository.ts";

describe("RealVibechkWorkdirGateway", () => {
	it("reads provenance through core git and Vibechk-local remote parsing", async () => {
		const coreGit = new InMemoryGitGateway({
			repoRoot: "/repo/root",
			currentBranch: "feature/demo",
			headCommit: "abc123",
		});
		const execApi = new ScriptedCommandExecApi([
			exitedResult({
				stdout:
					"origin git@github.com:owner/repo.git (fetch)\n" +
					"origin https://github.com/owner/repo.git (push)\n" +
					"upstream git@github.com:upstream/repo.git (fetch)\n",
			}),
		]);
		const gateway = new RealVibechkWorkdirGateway({ workdir: "/repo", execApi, coreGit });

		await expect(gateway.readProvenance()).resolves.toEqual({
			repoRoot: "/repo/root",
			startingBranch: "feature/demo",
			startingCommit: "abc123",
			remotes: {
				origin: "git@github.com:owner/repo.git",
				upstream: "git@github.com:upstream/repo.git",
			},
		});
		expect(coreGit.repoRootCalls).toEqual([{ cwd: "/repo" }]);
		expect(coreGit.currentBranchCalls).toEqual([{ cwd: "/repo" }]);
		expect(coreGit.headCommitCalls).toEqual([{ cwd: "/repo" }]);
		expect(execApi.calls()).toMatchObject([
			{
				command: "git",
				args: ["remote", "-v"],
				options: { cwd: "/repo", timeout: 10_000 },
			},
		]);
	});

	it("maps detached HEAD while reading provenance", async () => {
		const coreGit = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const gateway = new RealVibechkWorkdirGateway({
			workdir: "/repo",
			execApi: new ScriptedCommandExecApi(),
			coreGit,
		});

		await expect(gateway.readProvenance()).rejects.toThrow(
			"Could not determine current branch in /repo\nDetached HEAD.",
		);
	});

	it("maps core missing-git failures to VibechkError", async () => {
		const coreGit = new InMemoryGitGateway({
			headCommit: {
				type: "failure",
				error: { code: "head_commit_failed", message: "spawn git ENOENT" },
			},
		});
		const gateway = new RealVibechkWorkdirGateway({
			workdir: "/repo",
			execApi: new ScriptedCommandExecApi(),
			coreGit,
		});

		await expect(gateway.readProvenance()).rejects.toThrow("git is not installed or not on PATH.");
	});

	it("delegates change detection to core git for the workdir", async () => {
		const coreGit = new InMemoryGitGateway({ dirtyPaths: ["."] });
		const gateway = new RealVibechkWorkdirGateway({
			workdir: "/repo",
			execApi: new ScriptedCommandExecApi(),
			coreGit,
		});

		await expect(gateway.hasChanges()).resolves.toBe(true);
		expect(coreGit.hasUncommittedChangesUnderCalls).toEqual([{ cwd: "/repo", relativePath: "." }]);
	});

	it("captures diffs with Vibechk-local raw git commands", async () => {
		const coreGit = new InMemoryGitGateway({ dirtyPaths: ["."] });
		const execApi = new ScriptedCommandExecApi([
			exitedResult(),
			exitedResult({ stdout: "diff --git a/result.txt b/result.txt\n+content\n" }),
		]);
		const gateway = new RealVibechkWorkdirGateway({ workdir: "/repo", execApi, coreGit });

		await expect(gateway.diffPatch()).resolves.toBe(
			"diff --git a/result.txt b/result.txt\n+content",
		);
		expect(execApi.calls()).toMatchObject([
			{ command: "git", args: ["add", "-N", "."], options: { cwd: "/repo" } },
			{ command: "git", args: ["diff", "--binary", "HEAD"], options: { cwd: "/repo" } },
		]);
	});

	it("creates result branch through core before committing through Vibechk-local git commands", async () => {
		const coreGit = new InMemoryGitGateway();
		const execApi = new ScriptedCommandExecApi([exitedResult(), exitedResult(), exitedResult()]);
		const gateway = new RealVibechkWorkdirGateway({ workdir: "/repo", execApi, coreGit });

		await expect(
			gateway.createResultBranchAndCommit("vibechk/run1", "vibechk: capture run run1"),
		).resolves.toBeUndefined();
		expect(coreGit.createBranchAtHeadCalls).toEqual([{ cwd: "/repo", branch: "vibechk/run1" }]);
		expect(execApi.calls()).toMatchObject([
			{ command: "git", args: ["switch", "vibechk/run1"] },
			{ command: "git", args: ["add", "-A"] },
			{ command: "git", args: ["commit", "-m", "vibechk: capture run run1"] },
		]);
	});

	it("surfaces core branch creation errors before raw result-branch commands", async () => {
		const coreGit = new InMemoryGitGateway({
			createBranchFailure: {
				code: "create_branch_failed",
				message: "branch already exists",
			},
		});
		const execApi = new ScriptedCommandExecApi();
		const gateway = new RealVibechkWorkdirGateway({ workdir: "/repo", execApi, coreGit });

		await expect(
			gateway.createResultBranchAndCommit("vibechk/run1", "vibechk: capture run run1"),
		).rejects.toThrow("Could not create result branch vibechk/run1\nbranch already exists");
		expect(execApi.calls()).toEqual([]);
	});

	it("restores the starting branch with a semantic wrapper over git switch", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const gateway = new RealVibechkWorkdirGateway({
			workdir: "/repo",
			execApi,
			coreGit: new InMemoryGitGateway(),
		});

		await expect(gateway.restoreBranch("main")).resolves.toBeUndefined();
		expect(execApi.calls()).toMatchObject([
			{ command: "git", args: ["switch", "main"], options: { cwd: "/repo", timeout: 10_000 } },
		]);
	});

	it("maps missing git startup failures from raw commands to VibechkError", async () => {
		const execApi = new ScriptedCommandExecApi([spawnFailedResult("spawn git ENOENT")]);
		const gateway = new RealVibechkWorkdirGateway({
			workdir: "/repo",
			execApi,
			coreGit: new InMemoryGitGateway(),
		});

		await expect(gateway.restoreBranch("main")).rejects.toThrow(
			"git is not installed or not on PATH.",
		);
	});
});

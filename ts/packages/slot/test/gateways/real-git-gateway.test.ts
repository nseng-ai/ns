import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import { RealSlotGitGateway } from "../../src/gateways/git.ts";

describe("RealSlotGitGateway", () => {
	it("runs git commands through the injected shared command exec API", async () => {
		const execApi = new ScriptedExecApi({ stdout: "/repo\n", stderr: "", code: 0, killed: false });
		const gateway = new RealSlotGitGateway({ cwd: "/repo", env: { PATH: "/fake/bin" }, execApi });

		await expect(gateway.getRepositoryRoot("/repo/subdir")).resolves.toBe("/repo");
		expect(execApi.calls()).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				cwd: "/repo/subdir",
				timeout: 10_000,
			},
		]);
	});

	it.each([
		["MERGE_HEAD", "merge"],
		["CHERRY_PICK_HEAD", "cherry-pick"],
		["REVERT_HEAD", "revert"],
		["rebase-merge", "rebase"],
		["rebase-apply", "rebase"],
		["BISECT_LOG", "bisect"],
	])("detects %s directly from an absolute worktree admin dir", async (markerPath, operation) => {
		const fixture = createWorktreeFixture({ gitdir: "absolute" });
		try {
			writeMarker(fixture.adminDir, markerPath);
			const execApi = new ScriptedExecApi({ stdout: worktreeListOutput(fixture.worktreePath, "feature/a"), stderr: "", code: 0, killed: false });
			const gateway = new RealSlotGitGateway({ cwd: fixture.worktreePath, env: { PATH: "/fake/bin" }, execApi });

			expect(await gateway.listBranchOccupancies()).toEqual([{ path: fixture.worktreePath, branch: "feature/a", operation }]);
			expect(execApi.calls()).toEqual([{ command: "git", args: ["worktree", "list", "--porcelain"], cwd: fixture.worktreePath, timeout: 10_000 }]);
		} finally {
			fixture.cleanup();
		}
	});

	it("resolves relative gitdir pointers", async () => {
		const fixture = createWorktreeFixture({ gitdir: "relative" });
		try {
			writeMarker(fixture.adminDir, "REVERT_HEAD");
			const execApi = new ScriptedExecApi({ stdout: worktreeListOutput(fixture.worktreePath, "feature/relative"), stderr: "", code: 0, killed: false });
			const gateway = new RealSlotGitGateway({ cwd: fixture.worktreePath, env: { PATH: "/fake/bin" }, execApi });

			expect(await gateway.listBranchOccupancies()).toEqual([{ path: fixture.worktreePath, branch: "feature/relative", operation: "revert" }]);
		} finally {
			fixture.cleanup();
		}
	});

	it("supports the main worktree .git directory layout", async () => {
		const fixture = createWorktreeFixture({ gitdir: "directory" });
		try {
			writeMarker(fixture.adminDir, "BISECT_LOG");
			const execApi = new ScriptedExecApi({ stdout: worktreeListOutput(fixture.worktreePath, "feature/main"), stderr: "", code: 0, killed: false });
			const gateway = new RealSlotGitGateway({ cwd: fixture.worktreePath, env: { PATH: "/fake/bin" }, execApi });

			expect(await gateway.listBranchOccupancies()).toEqual([{ path: fixture.worktreePath, branch: "feature/main", operation: "bisect" }]);
		} finally {
			fixture.cleanup();
		}
	});

	it("treats missing or malformed .git files as checked out", async () => {
		const fixture = createWorktreeFixture({ gitdir: "malformed" });
		try {
			const execApi = new ScriptedExecApi({ stdout: worktreeListOutput(fixture.worktreePath, "feature/clean"), stderr: "", code: 0, killed: false });
			const gateway = new RealSlotGitGateway({ cwd: fixture.worktreePath, env: { PATH: "/fake/bin" }, execApi });

			expect(await gateway.listBranchOccupancies()).toEqual([{ path: fixture.worktreePath, branch: "feature/clean", operation: "checked-out" }]);
		} finally {
			fixture.cleanup();
		}
	});
});

interface ExecCall {
	command: string;
	args: readonly string[];
	cwd: string | undefined;
	timeout: number | undefined;
}

class ScriptedExecApi implements CommandExecApi {
	private readonly result: ExecResult;
	private readonly log: ExecCall[] = [];

	constructor(result: ExecResult) {
		this.result = result;
	}

	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		this.log.push({ command, args: [...args], cwd: options.cwd, timeout: options.timeout });
		return { ...this.result };
	}

	calls(): readonly ExecCall[] {
		return this.log.map((call) => ({ ...call, args: [...call.args] }));
	}
}

interface WorktreeFixture {
	worktreePath: string;
	adminDir: string;
	cleanup: () => void;
}

function createWorktreeFixture(options: { gitdir: "absolute" | "relative" | "directory" | "malformed" }): WorktreeFixture {
	const root = mkdtempSync(join(tmpdir(), "slot-real-git-"));
	const worktreePath = join(root, "worktree");
	const adminDir = options.gitdir === "directory" ? join(worktreePath, ".git") : join(root, "admin");
	mkdirSync(worktreePath, { recursive: true });
	mkdirSync(adminDir, { recursive: true });
	if (options.gitdir === "absolute") writeFileSync(join(worktreePath, ".git"), `gitdir: ${adminDir}\n`);
	if (options.gitdir === "relative") writeFileSync(join(worktreePath, ".git"), "gitdir: ../admin\n");
	if (options.gitdir === "malformed") writeFileSync(join(worktreePath, ".git"), "not a gitdir pointer\n");
	return { worktreePath, adminDir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeMarker(adminDir: string, markerPath: string): void {
	const fullPath = join(adminDir, markerPath);
	if (markerPath.startsWith("rebase-")) {
		mkdirSync(fullPath, { recursive: true });
		return;
	}
	writeFileSync(fullPath, "marker\n");
}

function worktreeListOutput(path: string, branch: string): string {
	return [`worktree ${path}`, "HEAD 1111111111111111111111111111111111111111", `branch refs/heads/${branch}`, ""].join("\n");
}

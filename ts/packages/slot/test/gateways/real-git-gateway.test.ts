import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import type { SlotCommandDiagnosticEvent, SlotDiagnosticSink } from "../../src/diagnostics.ts";
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

	it("maps branch existence from git show-ref exit codes", async () => {
		const execApi = new ScriptedExecApi([
			{ stdout: "", stderr: "", code: 0, killed: false },
			{ stdout: "", stderr: "missing", code: 1, killed: false },
		]);
		const gateway = new RealSlotGitGateway({ cwd: "/repo", env: { PATH: "/fake/bin" }, execApi });

		await expect(gateway.branchExists("master")).resolves.toBe(true);
		await expect(gateway.branchExists("feature/a")).resolves.toBe(false);
		expect(execApi.calls()).toEqual([
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/master"],
				cwd: "/repo",
				timeout: 10_000,
			},
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/feature/a"],
				cwd: "/repo",
				timeout: 10_000,
			},
		]);
	});

	it("creates branches with normal and force command arguments", async () => {
		const execApi = new ScriptedExecApi([
			{ stdout: "", stderr: "", code: 0, killed: false },
			{ stdout: "", stderr: "", code: 0, killed: false },
		]);
		const gateway = new RealSlotGitGateway({ cwd: "/repo", env: { PATH: "/fake/bin" }, execApi });

		await expect(
			gateway.createBranch("feature/a", "HEAD", { shouldForce: false }),
		).resolves.toBeNull();
		await expect(
			gateway.createBranch("feature/b", "master", { shouldForce: true }),
		).resolves.toBeNull();
		expect(execApi.calls()).toEqual([
			{
				command: "git",
				args: ["branch", "feature/a", "HEAD"],
				cwd: "/repo",
				timeout: 10_000,
			},
			{
				command: "git",
				args: ["branch", "-f", "feature/b", "master"],
				cwd: "/repo",
				timeout: 10_000,
			},
		]);
	});

	it("emits checkout, previous-branch, and detach command arguments", async () => {
		const execApi = new ScriptedExecApi([
			{ stdout: "", stderr: "", code: 0, killed: false },
			{ stdout: "master\n", stderr: "", code: 0, killed: false },
			{ stdout: "", stderr: "", code: 0, killed: false },
		]);
		const gateway = new RealSlotGitGateway({ cwd: "/repo", env: { PATH: "/fake/bin" }, execApi });

		await expect(gateway.checkoutBranch("/repo/worktree", "feature/a")).resolves.toBeNull();
		await expect(gateway.getPreviousBranch("/repo/worktree")).resolves.toBe("master");
		await expect(gateway.detachHead("/repo/worktree", "master")).resolves.toBeNull();
		expect(execApi.calls()).toEqual([
			{
				command: "git",
				args: ["checkout", "feature/a"],
				cwd: "/repo/worktree",
				timeout: 10_000,
			},
			{
				command: "git",
				args: ["rev-parse", "--abbrev-ref", "@{-1}"],
				cwd: "/repo/worktree",
				timeout: 10_000,
			},
			{
				command: "git",
				args: ["checkout", "--detach", "master"],
				cwd: "/repo/worktree",
				timeout: 10_000,
			},
		]);
	});

	it("returns movement command failures without throwing", async () => {
		const execApi = new ScriptedExecApi({
			stdout: "",
			stderr: "fatal: branch already exists\n",
			code: 128,
			killed: false,
		});
		const gateway = new RealSlotGitGateway({ cwd: "/repo", env: { PATH: "/fake/bin" }, execApi });

		await expect(
			gateway.createBranch("feature/a", "HEAD", { shouldForce: false }),
		).resolves.toEqual({ message: "fatal: branch already exists" });
	});

	it("emits labeled command diagnostics when a sink is injected", async () => {
		const execApi = new ScriptedExecApi({ stdout: "/repo\n", stderr: "", code: 0, killed: false });
		const diagnosticSink = new InMemoryDiagnosticSink();
		const gateway = new RealSlotGitGateway({
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			execApi,
			diagnosticSink,
		});

		await expect(gateway.getRepositoryRoot("/repo/subdir")).resolves.toBe("/repo");
		expect(diagnosticSink.events()).toEqual([
			expect.objectContaining({
				type: "slot.command",
				operation: "slot.git.get_repository_root",
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				displayCommand: "git rev-parse --show-toplevel",
				cwd: "/repo/subdir",
				timeoutMs: 10_000,
				exitCode: 0,
				killed: false,
				stdoutBytes: 6,
				stderrBytes: 0,
			}),
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
			const execApi = new ScriptedExecApi({
				stdout: worktreeListOutput(fixture.worktreePath, "feature/a"),
				stderr: "",
				code: 0,
				killed: false,
			});
			const gateway = new RealSlotGitGateway({
				cwd: fixture.worktreePath,
				env: { PATH: "/fake/bin" },
				execApi,
			});

			expect(await gateway.listBranchOccupancies()).toEqual([
				{ path: fixture.worktreePath, branch: "feature/a", operation },
			]);
			expect(execApi.calls()).toEqual([
				{
					command: "git",
					args: ["worktree", "list", "--porcelain"],
					cwd: fixture.worktreePath,
					timeout: 10_000,
				},
			]);
		} finally {
			fixture.cleanup();
		}
	});

	it("resolves relative gitdir pointers", async () => {
		const fixture = createWorktreeFixture({ gitdir: "relative" });
		try {
			writeMarker(fixture.adminDir, "REVERT_HEAD");
			const execApi = new ScriptedExecApi({
				stdout: worktreeListOutput(fixture.worktreePath, "feature/relative"),
				stderr: "",
				code: 0,
				killed: false,
			});
			const gateway = new RealSlotGitGateway({
				cwd: fixture.worktreePath,
				env: { PATH: "/fake/bin" },
				execApi,
			});

			expect(await gateway.listBranchOccupancies()).toEqual([
				{ path: fixture.worktreePath, branch: "feature/relative", operation: "revert" },
			]);
		} finally {
			fixture.cleanup();
		}
	});

	it("supports the main worktree .git directory layout", async () => {
		const fixture = createWorktreeFixture({ gitdir: "directory" });
		try {
			writeMarker(fixture.adminDir, "BISECT_LOG");
			const execApi = new ScriptedExecApi({
				stdout: worktreeListOutput(fixture.worktreePath, "feature/main"),
				stderr: "",
				code: 0,
				killed: false,
			});
			const gateway = new RealSlotGitGateway({
				cwd: fixture.worktreePath,
				env: { PATH: "/fake/bin" },
				execApi,
			});

			expect(await gateway.listBranchOccupancies()).toEqual([
				{ path: fixture.worktreePath, branch: "feature/main", operation: "bisect" },
			]);
		} finally {
			fixture.cleanup();
		}
	});

	it("treats missing or malformed .git files as checked out", async () => {
		const fixture = createWorktreeFixture({ gitdir: "malformed" });
		try {
			const execApi = new ScriptedExecApi({
				stdout: worktreeListOutput(fixture.worktreePath, "feature/clean"),
				stderr: "",
				code: 0,
				killed: false,
			});
			const gateway = new RealSlotGitGateway({
				cwd: fixture.worktreePath,
				env: { PATH: "/fake/bin" },
				execApi,
			});

			expect(await gateway.listBranchOccupancies()).toEqual([
				{ path: fixture.worktreePath, branch: "feature/clean", operation: "checked-out" },
			]);
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

class InMemoryDiagnosticSink implements SlotDiagnosticSink {
	private readonly log: SlotCommandDiagnosticEvent[] = [];

	recordCommand(event: SlotCommandDiagnosticEvent): void {
		this.log.push(event);
	}

	events(): readonly SlotCommandDiagnosticEvent[] {
		return this.log.map((event) => ({ ...event, args: [...event.args] }));
	}
}

class ScriptedExecApi implements CommandExecApi {
	private readonly results: ExecResult[];
	private readonly log: ExecCall[] = [];
	private nextIndex = 0;

	constructor(result: ExecResult | readonly ExecResult[]) {
		this.results = Array.isArray(result) ? result.map((entry) => ({ ...entry })) : [{ ...result }];
	}

	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		this.log.push({ command, args: [...args], cwd: options.cwd, timeout: options.timeout });
		const result = this.results[this.nextIndex] ?? this.results.at(-1) ?? emptyExecResult();
		this.nextIndex += 1;
		return { ...result };
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

function createWorktreeFixture(options: {
	gitdir: "absolute" | "relative" | "directory" | "malformed";
}): WorktreeFixture {
	const root = mkdtempSync(join(tmpdir(), "slot-real-git-"));
	const worktreePath = join(root, "worktree");
	const adminDir =
		options.gitdir === "directory" ? join(worktreePath, ".git") : join(root, "admin");
	mkdirSync(worktreePath, { recursive: true });
	mkdirSync(adminDir, { recursive: true });
	if (options.gitdir === "absolute")
		writeFileSync(join(worktreePath, ".git"), `gitdir: ${adminDir}\n`);
	if (options.gitdir === "relative")
		writeFileSync(join(worktreePath, ".git"), "gitdir: ../admin\n");
	if (options.gitdir === "malformed")
		writeFileSync(join(worktreePath, ".git"), "not a gitdir pointer\n");
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

function emptyExecResult(): ExecResult {
	return { stdout: "", stderr: "", code: 0, killed: false };
}

function worktreeListOutput(path: string, branch: string): string {
	return [
		`worktree ${path}`,
		"HEAD 1111111111111111111111111111111111111111",
		`branch refs/heads/${branch}`,
		"",
	].join("\n");
}

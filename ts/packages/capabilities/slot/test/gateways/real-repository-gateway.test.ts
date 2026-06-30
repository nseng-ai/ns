import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ExecResult } from "@sdl/exec";
import { InMemoryGitGateway } from "@sdl/capability-kit/git/testing";
import { ScriptedCommandExecApi } from "@sdl/exec/testing";
import type { SlotCommandDiagnosticEvent, SlotDiagnosticSink } from "../../src/diagnostics.ts";
import { RealSlotRepositoryGateway } from "../../src/gateways/repository.ts";

describe("RealSlotRepositoryGateway", () => {
	it("delegates repository root lookup to the injected core git gateway", async () => {
		const coreGit = new InMemoryGitGateway({ repoRoot: "/repo" });
		const gateway = new RealSlotRepositoryGateway({
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			coreGit,
		});

		await expect(gateway.getRepositoryRoot("/repo/subdir")).resolves.toBe("/repo");
		expect(coreGit.repoRootCalls).toEqual([{ cwd: "/repo/subdir" }]);
	});

	it("maps current branch results from the core git gateway", async () => {
		const branchGit = new InMemoryGitGateway({ currentBranch: "feature/a" });
		const detachedGit = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const failingGit = new InMemoryGitGateway({
			currentBranch: { type: "failure", error: { code: "boom", message: "branch failed" } },
		});

		await expect(
			new RealSlotRepositoryGateway({ cwd: "/repo", coreGit: branchGit }).getCurrentBranch(
				"/repo/worktree",
			),
		).resolves.toEqual({ type: "branch", branch: "feature/a" });
		await expect(
			new RealSlotRepositoryGateway({ cwd: "/repo", coreGit: detachedGit }).getCurrentBranch(
				"/repo/worktree",
			),
		).resolves.toEqual({ type: "detached" });
		await expect(
			new RealSlotRepositoryGateway({ cwd: "/repo", coreGit: failingGit }).getCurrentBranch(
				"/repo/worktree",
			),
		).resolves.toEqual({ type: "failure", failure: { message: "branch failed" } });
		expect(branchGit.currentBranchCalls).toEqual([{ cwd: "/repo/worktree" }]);
	});

	it("maps branch presence and errors from the core git gateway", async () => {
		const coreGit = new InMemoryGitGateway({
			existingBranches: ["master"],
			localBranchPresenceFailures: {
				"feature/error": {
					type: "failure",
					error: { code: "branch-presence-failed", message: "presence failed" },
				},
			},
		});
		const gateway = new RealSlotRepositoryGateway({ cwd: "/repo", coreGit });

		await expect(gateway.branchExists("master")).resolves.toBe(true);
		await expect(gateway.branchExists("feature/a")).resolves.toBe(false);
		await expect(gateway.branchExists("feature/error")).rejects.toThrow("presence failed");
		expect(coreGit.localBranchPresenceCalls).toEqual([
			{ cwd: "/repo", branch: "master" },
			{ cwd: "/repo", branch: "feature/a" },
			{ cwd: "/repo", branch: "feature/error" },
		]);
	});

	it("maps trunk branch results from the core git gateway", async () => {
		await expect(
			new RealSlotRepositoryGateway({
				cwd: "/repo",
				coreGit: new InMemoryGitGateway({ trunkBranch: "develop" }),
			}).getTrunkBranch(),
		).resolves.toBe("develop");
		await expect(
			new RealSlotRepositoryGateway({
				cwd: "/repo",
				coreGit: new InMemoryGitGateway({ trunkBranch: { type: "missing" } }),
			}).getTrunkBranch(),
		).resolves.toBe("master");
		await expect(
			new RealSlotRepositoryGateway({
				cwd: "/repo",
				coreGit: new InMemoryGitGateway({
					trunkBranch: {
						type: "failure",
						error: { code: "trunk_failed", message: "trunk failed" },
					},
				}),
			}).getTrunkBranch(),
		).rejects.toThrow("trunk failed");
	});

	it("delegates uncommitted-change checks to the core git path contract", async () => {
		const coreGit = new InMemoryGitGateway({ dirtyPaths: ["."] });
		const gateway = new RealSlotRepositoryGateway({ cwd: "/repo", coreGit });

		await expect(gateway.hasUncommittedChanges("/repo/worktree")).resolves.toBe(true);
		expect(coreGit.hasUncommittedChangesUnderCalls).toEqual([
			{ cwd: "/repo/worktree", relativePath: "." },
		]);
	});

	it("delegates local branch tip listing to the core git gateway", async () => {
		const coreGit = new InMemoryGitGateway({
			localBranchTips: [{ name: "feature/a", headIso: "2026-06-21T00:00:00.000Z" }],
		});
		const gateway = new RealSlotRepositoryGateway({ cwd: "/repo", coreGit });

		await expect(gateway.listLocalBranchTips()).resolves.toEqual([
			{ name: "feature/a", headIso: "2026-06-21T00:00:00.000Z" },
		]);
		expect(coreGit.listLocalBranchTipsCalls).toEqual([{ cwd: "/repo" }]);
	});

	it("creates branches with normal and force command arguments", async () => {
		const execApi = scriptedExecApi([
			{ stdout: "", stderr: "", code: 0, killed: false },
			{ stdout: "", stderr: "", code: 0, killed: false },
		]);
		const gateway = new RealSlotRepositoryGateway({
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			execApi,
		});

		await expect(
			gateway.createBranch("feature/a", "HEAD", { shouldForce: false }),
		).resolves.toBeNull();
		await expect(
			gateway.createBranch("feature/b", "master", { shouldForce: true }),
		).resolves.toBeNull();
		expect(execApi.calls()).toEqual([
			gitCall(["branch", "feature/a", "HEAD"], "/repo"),
			gitCall(["branch", "-f", "feature/b", "master"], "/repo"),
		]);
	});

	it("emits checkout, previous-branch, and detach command arguments", async () => {
		const execApi = scriptedExecApi([
			{ stdout: "", stderr: "", code: 0, killed: false },
			{ stdout: "master\n", stderr: "", code: 0, killed: false },
			{ stdout: "", stderr: "", code: 0, killed: false },
		]);
		const gateway = new RealSlotRepositoryGateway({
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			execApi,
		});

		await expect(gateway.checkoutBranch("/repo/worktree", "feature/a")).resolves.toBeNull();
		await expect(gateway.getPreviousBranch("/repo/worktree")).resolves.toBe("master");
		await expect(gateway.detachHead("/repo/worktree", "master")).resolves.toBeNull();
		expect(execApi.calls()).toEqual([
			gitCall(["checkout", "feature/a"], "/repo/worktree"),
			gitCall(["rev-parse", "--abbrev-ref", "@{-1}"], "/repo/worktree"),
			gitCall(["checkout", "--detach", "master"], "/repo/worktree"),
		]);
	});

	it("returns movement command failures without throwing", async () => {
		const execApi = scriptedExecApi({
			stdout: "",
			stderr: "fatal: branch already exists\n",
			code: 128,
			killed: false,
		});
		const gateway = new RealSlotRepositoryGateway({
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			execApi,
		});

		await expect(
			gateway.createBranch("feature/a", "HEAD", { shouldForce: false }),
		).resolves.toEqual({ message: "fatal: branch already exists" });
	});

	it("emits labeled command diagnostics for slot-owned raw git commands", async () => {
		const execApi = scriptedExecApi({
			stdout: worktreeListOutput("/repo", "master"),
			stderr: "",
			code: 0,
			killed: false,
		});
		const diagnosticSink = new InMemoryDiagnosticSink();
		const gateway = new RealSlotRepositoryGateway({
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			execApi,
			diagnosticSink,
		});

		await expect(gateway.listWorktrees()).resolves.toEqual([{ path: "/repo", branch: "master" }]);
		expect(diagnosticSink.events()).toEqual([
			expect.objectContaining({
				type: "slot.command",
				operation: "slot.git.list_worktrees",
				command: "git",
				args: ["worktree", "list", "--porcelain"],
				displayCommand: "git worktree list --porcelain",
				cwd: "/repo",
				timeoutMs: 10_000,
				exitCode: 0,
				killed: false,
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
			const execApi = scriptedExecApi({
				stdout: worktreeListOutput(fixture.worktreePath, "feature/a"),
				stderr: "",
				code: 0,
				killed: false,
			});
			const gateway = new RealSlotRepositoryGateway({
				cwd: fixture.worktreePath,
				env: { PATH: "/fake/bin" },
				execApi,
			});

			expect(await gateway.listBranchOccupancies()).toEqual([
				{ path: fixture.worktreePath, branch: "feature/a", operation },
			]);
			expect(execApi.calls()).toEqual([
				gitCall(["worktree", "list", "--porcelain"], fixture.worktreePath),
			]);
		} finally {
			fixture.cleanup();
		}
	});

	it("uses rebase head-name when porcelain reports a detached worktree", async () => {
		const fixture = createWorktreeFixture({ gitdir: "absolute" });
		try {
			writeRebaseHeadName(fixture.adminDir, "rebase-merge", "feature/rebasing");
			const execApi = scriptedExecApi({
				stdout: worktreeListOutput(fixture.worktreePath, null),
				stderr: "",
				code: 0,
				killed: false,
			});
			const gateway = new RealSlotRepositoryGateway({
				cwd: fixture.worktreePath,
				env: { PATH: "/fake/bin" },
				execApi,
			});

			expect(await gateway.listBranchOccupancies()).toEqual([
				{ path: fixture.worktreePath, branch: "feature/rebasing", operation: "rebase" },
			]);
		} finally {
			fixture.cleanup();
		}
	});

	it("resolves relative gitdir pointers", async () => {
		const fixture = createWorktreeFixture({ gitdir: "relative" });
		try {
			writeMarker(fixture.adminDir, "REVERT_HEAD");
			const execApi = scriptedExecApi({
				stdout: worktreeListOutput(fixture.worktreePath, "feature/relative"),
				stderr: "",
				code: 0,
				killed: false,
			});
			const gateway = new RealSlotRepositoryGateway({
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
			const execApi = scriptedExecApi({
				stdout: worktreeListOutput(fixture.worktreePath, "feature/main"),
				stderr: "",
				code: 0,
				killed: false,
			});
			const gateway = new RealSlotRepositoryGateway({
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
			const execApi = scriptedExecApi({
				stdout: worktreeListOutput(fixture.worktreePath, "feature/clean"),
				stderr: "",
				code: 0,
				killed: false,
			});
			const gateway = new RealSlotRepositoryGateway({
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

interface ExpectedExecCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options: {
		readonly cwd: string;
		readonly env: { readonly PATH: string };
		readonly timeout: number;
	};
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

function scriptedExecApi(
	results: Partial<ExecResult> | readonly Partial<ExecResult>[],
): ScriptedCommandExecApi {
	return new ScriptedCommandExecApi(Array.isArray(results) ? results : [results]);
}

function gitCall(args: readonly string[], cwd: string): ExpectedExecCall {
	return {
		command: "git",
		args: [...args],
		options: { cwd, env: { PATH: "/fake/bin" }, timeout: 10_000 },
	};
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

function writeRebaseHeadName(
	adminDir: string,
	rebaseDirName: "rebase-merge" | "rebase-apply",
	branch: string,
): void {
	const rebaseDir = join(adminDir, rebaseDirName);
	mkdirSync(rebaseDir, { recursive: true });
	writeFileSync(join(rebaseDir, "head-name"), `refs/heads/${branch}\n`);
}

function worktreeListOutput(path: string, branch: string | null): string {
	const lines = [`worktree ${path}`, "HEAD 1111111111111111111111111111111111111111"];
	if (branch !== null) lines.push(`branch refs/heads/${branch}`);
	lines.push("");
	return lines.join("\n");
}

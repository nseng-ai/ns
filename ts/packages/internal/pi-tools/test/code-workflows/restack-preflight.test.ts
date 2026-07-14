import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecResult } from "@nseng-ai/foundation/exec";
import type { GitResult, GitWorktreeStateFs } from "@nseng-ai/foundation/git";

import {
	createProvisionalRestackPreflight,
	type RestackPreflightGitGateway,
} from "../../src/code-workflows/restack-preflight.ts";

interface CommandCall {
	command: string;
	args: string[];
	cwd?: string;
}

class FakeCommands implements CommandExecApi {
	readonly calls: CommandCall[] = [];
	private readonly results: ExecResult[];

	constructor(results: ExecResult[] = [exited()]) {
		this.results = [...results];
	}

	async exec(command: string, args: string[], options: { cwd?: string } = {}): Promise<ExecResult> {
		this.calls.push(
			options.cwd === undefined ? { command, args } : { command, args, cwd: options.cwd },
		);
		const result = this.results.shift();
		if (result === undefined) throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
		return result;
	}
}

class FakeRepoRootGit implements RestackPreflightGitGateway {
	readonly cwdCalls: string[] = [];
	private readonly result: GitResult<string>;

	constructor(result: GitResult<string> = { ok: true, value: "/repo" }) {
		this.result = result;
	}

	async repoRoot(options: { cwd: string }): Promise<GitResult<string>> {
		this.cwdCalls.push(options.cwd);
		return this.result;
	}
}

interface FsEntry {
	kind: "file" | "directory";
	content?: string;
}

class FakeWorktreeStateFs implements GitWorktreeStateFs {
	readonly pathKindCalls: string[] = [];
	readonly readCalls: string[] = [];
	private readonly entries: ReadonlyMap<string, FsEntry>;
	private readonly unreadablePaths: ReadonlySet<string>;

	constructor(
		entries: Readonly<Record<string, FsEntry>>,
		options: { unreadablePaths?: readonly string[] } = {},
	) {
		this.entries = new Map(Object.entries(entries));
		this.unreadablePaths = new Set(options.unreadablePaths ?? []);
	}

	pathKind(path: string): "file" | "directory" | "missing" {
		this.pathKindCalls.push(path);
		if (this.unreadablePaths.has(path)) throw new Error(`unreadable: ${path}`);
		return this.entries.get(path)?.kind ?? "missing";
	}

	readTextFile(path: string): string {
		this.readCalls.push(path);
		if (this.unreadablePaths.has(path)) throw new Error(`unreadable: ${path}`);
		const entry = this.entries.get(path);
		if (entry?.kind !== "file") throw new Error(`not a readable file: ${path}`);
		return entry.content ?? "";
	}
}

function exited(options: { code?: number; stdout?: string; stderr?: string } = {}): ExecResult {
	return {
		type: "exited",
		code: options.code ?? 0,
		stdout: options.stdout ?? "",
		stderr: options.stderr ?? "",
		signal: null,
	};
}

function normalWorktree(entries: Readonly<Record<string, FsEntry>> = {}): FakeWorktreeStateFs {
	return new FakeWorktreeStateFs({
		"/repo/.git": { kind: "directory" },
		...entries,
	});
}

function createPreflight(options: {
	commands?: FakeCommands;
	git?: FakeRepoRootGit;
	fs: GitWorktreeStateFs;
}) {
	const commands = options.commands ?? new FakeCommands();
	const git = options.git ?? new FakeRepoRootGit();
	return {
		commands,
		git,
		run: createProvisionalRestackPreflight({ commands, git, fs: options.fs }),
	};
}

describe("provisional smart-restack preflight", () => {
	test("normalizes a nested cwd to the canonical repository root before Git-dir inspection", async () => {
		const fs = normalWorktree();
		const setup = createPreflight({ fs });

		const result = await setup.run({ cwd: "/repo/packages/nested" });

		expect(result).toEqual({ type: "ready" });
		expect(setup.commands.calls).toEqual([
			{ command: "git", args: ["status"], cwd: "/repo/packages/nested" },
		]);
		expect(setup.git.cwdCalls).toEqual(["/repo/packages/nested"]);
		expect(fs.pathKindCalls).toContain("/repo/.git");
		expect(fs.pathKindCalls).not.toContain("/repo/packages/nested/.git");
	});

	test("detects rebase-merge in a normal worktree", async () => {
		const fs = normalWorktree({
			"/repo/.git/rebase-merge": { kind: "directory" },
		});
		const setup = createPreflight({ fs });

		await expect(setup.run({ cwd: "/repo" })).resolves.toEqual({
			type: "rebase-in-progress",
		});
	});

	test("detects rebase through a linked-worktree gitdir pointer", async () => {
		const fs = new FakeWorktreeStateFs({
			"/repo/.git": {
				kind: "file",
				content: "gitdir: /repo-admin/worktrees/feature\n",
			},
			"/repo-admin/worktrees/feature/rebase-merge": { kind: "directory" },
		});
		const setup = createPreflight({ fs });

		await expect(setup.run({ cwd: "/repo/subdirectory" })).resolves.toEqual({
			type: "rebase-in-progress",
		});
		expect(fs.pathKindCalls).toContain("/repo-admin/worktrees/feature/rebase-merge");
	});

	test("maps non-rebase operation facts to ready", async () => {
		const fs = normalWorktree({
			"/repo/.git/MERGE_HEAD": { kind: "file", content: "abc123\n" },
		});
		const setup = createPreflight({ fs });

		await expect(setup.run({ cwd: "/repo" })).resolves.toEqual({ type: "ready" });
	});

	test("refuses when git status is unreadable before resolving the root", async () => {
		const commands = new FakeCommands([
			exited({ code: 1, stderr: "fatal: repository unavailable" }),
		]);
		const git = new FakeRepoRootGit();
		const setup = createPreflight({ commands, git, fs: normalWorktree() });

		const result = await setup.run({ cwd: "/repo" });

		expect(result).toMatchObject({ type: "refused" });
		expect(result.type === "refused" ? result.message : "").toContain(
			"Cannot inspect repository state with git status",
		);
		expect(git.cwdCalls).toEqual([]);
	});

	test("refuses when repository-root resolution fails", async () => {
		const git = new FakeRepoRootGit({
			ok: false,
			error: { code: "repo_root_failed", message: "git rev-parse failed" },
		});
		const setup = createPreflight({ git, fs: normalWorktree() });

		const result = await setup.run({ cwd: "/repo" });

		expect(result).toEqual({
			type: "refused",
			message:
				"Cannot resolve the repository root; not starting gt restack.\n\ngit rev-parse failed",
		});
	});

	test("refuses missing .git metadata", async () => {
		const setup = createPreflight({ fs: new FakeWorktreeStateFs({}) });

		const result = await setup.run({ cwd: "/repo" });

		expect(result).toEqual({
			type: "refused",
			message:
				"Cannot resolve the Git directory at /repo: .git is missing; not starting gt restack.",
		});
	});

	test("refuses a malformed .git pointer", async () => {
		const setup = createPreflight({
			fs: new FakeWorktreeStateFs({
				"/repo/.git": { kind: "file", content: "not a gitdir pointer\n" },
			}),
		});

		const result = await setup.run({ cwd: "/repo" });

		expect(result).toEqual({
			type: "refused",
			message:
				"Cannot resolve the Git directory at /repo: .git is neither a directory nor a valid gitdir file; not starting gt restack.",
		});
	});

	test("refuses unreadable .git metadata", async () => {
		const setup = createPreflight({
			fs: new FakeWorktreeStateFs(
				{ "/repo/.git": { kind: "file", content: "gitdir: /admin" } },
				{ unreadablePaths: ["/repo/.git"] },
			),
		});

		const result = await setup.run({ cwd: "/repo" });

		expect(result.type).toBe("refused");
		expect(result.type === "refused" ? result.message : "").toContain(
			"Cannot read Git directory metadata at /repo/.git",
		);
	});
});

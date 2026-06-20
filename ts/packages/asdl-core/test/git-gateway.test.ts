import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import { RealGitGateway } from "@asdl/core/git";

const ROOT = "/repo";
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const BRANCH = "planned-branches/branch-scoped-plan";

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

type ScriptedExec =
	| {
			command: string;
			args: string[];
			result: Partial<ExecResult>;
	  }
	| {
			command: string;
			args: string[];
			error: Error;
	  };

class ScriptedCommands implements CommandExecApi {
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: readonly ScriptedExec[]) {
		this.script = [...script];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if ("error" in expected) throw expected.error;
		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

function errorStep(command: string, args: string[], error: Error): ScriptedExec {
	return { command, args, error };
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

describe("real git gateway", () => {
	test("preserves repo root command protocol", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--show-toplevel"], { stdout: `\n${ROOT}\n` }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.repoRoot({ cwd: "/work" })).toEqual({ ok: true, value: ROOT });
		commands.assertDone();
		expect(commands.execCalls).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				options: { cwd: "/work", timeout: 10_000 },
			},
		]);
	});

	test("softens optional repo root failures", async () => {
		const commands = new ScriptedCommands([
			errorStep("git", ["rev-parse", "--show-toplevel"], new Error("spawn ENOENT")),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.optionalRepoRoot({ cwd: "/work" })).toEqual({ type: "missing" });
		commands.assertDone();
	});

	test("preserves branch fact command protocols", async () => {
		const commands = new ScriptedCommands([
			step("git", ["branch", "--show-current"], { stdout: "feature/source-plan\n" }),
			step("git", ["config", "--get", "remote.origin.url"], {
				stdout: "git@github.com:Owner/Repo.git\n",
			}),
			step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.currentBranch({ cwd: ROOT, env: { PATH: "/fake/bin" } })).toEqual({
			type: "branch",
			branch: "feature/source-plan",
		});
		expect(await git.originUrl({ cwd: ROOT })).toEqual({
			type: "found",
			value: "git@github.com:Owner/Repo.git\n",
		});
		expect(await git.headCommit({ cwd: ROOT })).toEqual({ ok: true, value: START_POINT });
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["branch", "--show-current"],
			["config", "--get", "remote.origin.url"],
			["rev-parse", "HEAD"],
		]);
		expect(commands.execCalls[0]?.options).toEqual({
			cwd: ROOT,
			timeout: 10_000,
			env: { PATH: "/fake/bin" },
		});
		expect(commands.execCalls.every((call) => call.options?.timeout === 10_000)).toBe(true);
	});

	test("resolves git paths with absolute path command protocol", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], {
				stdout: "/repo/.git/info/exclude\n",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.gitPath({ cwd: "/work", relativePath: "info/exclude" })).toEqual({
			ok: true,
			value: "/repo/.git/info/exclude",
		});
		commands.assertDone();
		expect(commands.execCalls).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"],
				options: { cwd: "/work", timeout: 10_000 },
			},
		]);
	});

	test("normalizes relative git path output defensively", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], {
				stdout: "relative/info/exclude\n",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.gitPath({ cwd: "/work", relativePath: "info/exclude" })).toEqual({
			ok: true,
			value: "/work/relative/info/exclude",
		});
		commands.assertDone();
	});

	test("reports git path command failures", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], {
				code: 128,
				stderr: "fatal: not a git repository",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.gitPath({ cwd: "/work", relativePath: "info/exclude" })).toMatchObject({
			ok: false,
			error: {
				code: "git_path_failed",
				displayCommand: "git rev-parse --path-format=absolute --git-path info/exclude",
			},
		});
		commands.assertDone();
	});

	test("reports empty git path output", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], {
				stdout: "\n",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.gitPath({ cwd: "/work", relativePath: "info/exclude" })).toEqual({
			ok: false,
			error: {
				code: "git_path_empty",
				message:
					"git rev-parse --git-path returned no path.\nCommand: git rev-parse --path-format=absolute --git-path info/exclude",
				displayCommand: "git rev-parse --path-format=absolute --git-path info/exclude",
			},
		});
		commands.assertDone();
	});

	test("reports detached current branch", async () => {
		const commands = new ScriptedCommands([
			step("git", ["branch", "--show-current"], { stdout: "\n" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.currentBranch({ cwd: ROOT })).toEqual({ type: "detached" });
		commands.assertDone();
	});

	test("reports current branch command failures", async () => {
		const commands = new ScriptedCommands([
			step("git", ["branch", "--show-current"], { code: 2, stderr: "boom" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.currentBranch({ cwd: ROOT })).toMatchObject({
			type: "failure",
			error: { code: "current_branch_failed" },
		});
		commands.assertDone();
	});

	test("detects whether cwd is inside a work tree", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--is-inside-work-tree"], { stdout: "true\n" }),
			step("git", ["rev-parse", "--is-inside-work-tree"], { stdout: "false\n" }),
			step("git", ["rev-parse", "--is-inside-work-tree"], {
				code: 128,
				stderr: "fatal: not a git repository",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.isInsideWorkTree({ cwd: ROOT })).toEqual({ ok: true, value: true });
		expect(await git.isInsideWorkTree({ cwd: ROOT })).toEqual({ ok: true, value: false });
		expect(await git.isInsideWorkTree({ cwd: ROOT })).toEqual({ ok: true, value: false });
		commands.assertDone();
	});

	test("reports unexpected work tree probe failures", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--is-inside-work-tree"], { code: 2, stderr: "boom" }),
			step("git", ["rev-parse", "--is-inside-work-tree"], { killed: true }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.isInsideWorkTree({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "work_tree_probe_failed" },
		});
		expect(await git.isInsideWorkTree({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "work_tree_probe_failed" },
		});
		commands.assertDone();
	});

	test("treats missing origin URL as optional", async () => {
		const commands = new ScriptedCommands([
			step("git", ["config", "--get", "remote.origin.url"], { code: 1 }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.originUrl({ cwd: ROOT })).toEqual({ type: "missing" });
		commands.assertDone();
	});

	test("resolves trunk branch through origin HEAD when candidate exists locally", async () => {
		const commands = new ScriptedCommands([
			step("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
				stdout: "origin/trunk\n",
			}),
			step("git", ["rev-parse", "--verify", "refs/heads/trunk"]),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.trunkBranch({ cwd: ROOT })).toEqual({ type: "found", value: "trunk" });
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
			["rev-parse", "--verify", "refs/heads/trunk"],
		]);
	});

	test("falls back when origin HEAD candidate is absent locally", async () => {
		const commands = new ScriptedCommands([
			step("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
				stdout: "origin/develop\n",
			}),
			step("git", ["rev-parse", "--verify", "refs/heads/develop"], { code: 1 }),
			step("git", ["rev-parse", "--verify", "refs/heads/main"], { code: 1 }),
			step("git", ["rev-parse", "--verify", "refs/heads/master"]),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.trunkBranch({ cwd: ROOT })).toEqual({ type: "found", value: "master" });
		commands.assertDone();
	});

	test("falls back to main probe when origin HEAD lookup fails", async () => {
		const commands = new ScriptedCommands([
			step("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { code: 1 }),
			step("git", ["rev-parse", "--verify", "refs/heads/main"]),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.trunkBranch({ cwd: ROOT })).toEqual({ type: "found", value: "main" });
		commands.assertDone();
	});

	test("treats branch presence errors as absent while resolving trunk", async () => {
		const commands = new ScriptedCommands([
			step("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
				stdout: "origin/trunk\n",
			}),
			step("git", ["rev-parse", "--verify", "refs/heads/trunk"], { code: 2, stderr: "boom" }),
			step("git", ["rev-parse", "--verify", "refs/heads/main"]),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.trunkBranch({ cwd: ROOT })).toEqual({ type: "found", value: "main" });
		commands.assertDone();
	});

	test("returns missing trunk when symbolic-ref and local fallbacks fail", async () => {
		const commands = new ScriptedCommands([
			step("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { code: 1 }),
			step("git", ["rev-parse", "--verify", "refs/heads/main"], { code: 1 }),
			step("git", ["rev-parse", "--verify", "refs/heads/master"], {
				code: 128,
				stderr: "fatal: Needed a single revision",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.trunkBranch({ cwd: ROOT })).toEqual({ type: "missing" });
		commands.assertDone();
	});

	test("preserves branch ref, presence, and creation command protocols", async () => {
		const commands = new ScriptedCommands([
			step("git", ["check-ref-format", "--branch", BRANCH]),
			step("git", ["rev-parse", "--verify", `refs/heads/${BRANCH}`], {
				code: 1,
				stderr: "missing",
			}),
			step("git", ["branch", BRANCH, "HEAD"]),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.validateBranchRef({ cwd: ROOT, branch: BRANCH })).toEqual({ ok: true });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({
			type: "absent",
			refName: `refs/heads/${BRANCH}`,
		});
		expect(await git.createBranchAtHead({ cwd: ROOT, branch: BRANCH })).toEqual({ ok: true });
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["check-ref-format", "--branch", BRANCH],
			["rev-parse", "--verify", `refs/heads/${BRANCH}`],
			["branch", BRANCH, "HEAD"],
		]);
	});

	test("reports present branches and missing-revision absence", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--verify", `refs/heads/${BRANCH}`]),
			step("git", ["rev-parse", "--verify", "refs/heads/missing"], {
				code: 128,
				stderr: "fatal: Needed a single revision",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({
			type: "present",
			refName: `refs/heads/${BRANCH}`,
			displayCommand: `git rev-parse --verify refs/heads/${BRANCH}`,
		});
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "missing" })).toEqual({
			type: "absent",
			refName: "refs/heads/missing",
		});
		commands.assertDone();
	});

	test("preserves generic git fact command protocols", async () => {
		const controller = new AbortController();
		const commands = new ScriptedCommands([
			step("git", ["status", "--porcelain", "--", ".asdl/objectives"], {
				stdout: " M .asdl/objectives/a/objective.md\n",
			}),
			step(
				"git",
				["for-each-ref", "--format=%(refname:short)%09%(committerdate:iso-strict)", "refs/heads"],
				{
					stdout: "feature/a\t2026-06-15T12:00:00+00:00\nfeature/b\t\n\n",
				},
			),
			step("git", ["rev-parse", "refs/heads/main:.asdl/objectives"], { stdout: "tree-main\n" }),
			step("git", ["rev-parse", "refs/heads/feature:.asdl/objectives"], {
				stderr: "fatal: path '.asdl/objectives' does not exist in 'refs/heads/feature'",
				code: 128,
			}),
			step("git", ["diff", "--name-only", "main..feature", "--", ".asdl/objectives"], {
				stdout: " .asdl/objectives/a/objective.md\n\n.asdl/objectives/b/roadmap.md\n",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(
			await git.hasUncommittedChangesUnder({
				cwd: ROOT,
				relativePath: ".asdl/objectives",
				signal: controller.signal,
			}),
		).toEqual({ ok: true, value: true });
		expect(await git.listLocalBranchTips({ cwd: ROOT })).toEqual({
			ok: true,
			value: [
				{ name: "feature/a", headIso: "2026-06-15T12:00:00+00:00" },
				{ name: "feature/b", headIso: null },
			],
		});
		expect(
			await git.treeOidsAtRefs({
				cwd: ROOT,
				refs: ["refs/heads/main", "refs/heads/feature"],
				relativePath: ".asdl/objectives",
			}),
		).toEqual({
			ok: true,
			value: { "refs/heads/main": "tree-main", "refs/heads/feature": null },
		});
		expect(
			await git.changedPathsUnder({
				cwd: ROOT,
				revisionRange: "main..feature",
				relativePath: ".asdl/objectives",
			}),
		).toEqual({
			ok: true,
			value: [".asdl/objectives/a/objective.md", ".asdl/objectives/b/roadmap.md"],
		});
		commands.assertDone();
		expect(commands.execCalls[0]).toEqual({
			command: "git",
			args: ["status", "--porcelain", "--", ".asdl/objectives"],
			options: { cwd: ROOT, timeout: 10_000, signal: controller.signal },
		});
		expect(commands.execCalls.map((call) => call.options?.timeout)).toEqual([
			10_000, 10_000, 10_000, 10_000, 10_000,
		]);
	});

	test("reports generic git fact failures", async () => {
		const commands = new ScriptedCommands([
			step("git", ["status", "--porcelain", "--", ".asdl/objectives"], {
				code: 2,
				stderr: "bad status",
			}),
			errorStep(
				"git",
				["for-each-ref", "--format=%(refname:short)%09%(committerdate:iso-strict)", "refs/heads"],
				new Error("spawn ENOENT"),
			),
			step("git", ["rev-parse", "HEAD:.asdl/objectives"], { code: 2, stderr: "unexpected" }),
			step("git", ["diff", "--name-only", "main..feature", "--", ".asdl/objectives"], {
				killed: true,
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(
			await git.hasUncommittedChangesUnder({ cwd: ROOT, relativePath: ".asdl/objectives" }),
		).toMatchObject({ ok: false, error: { code: "git_dirty_status_failed" } });
		expect(await git.listLocalBranchTips({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_startup_failed" },
		});
		expect(
			await git.treeOidsAtRefs({ cwd: ROOT, refs: ["HEAD"], relativePath: ".asdl/objectives" }),
		).toMatchObject({ ok: false, error: { code: "git_tree_oid_failed" } });
		expect(
			await git.changedPathsUnder({
				cwd: ROOT,
				revisionRange: "main..feature",
				relativePath: ".asdl/objectives",
			}),
		).toMatchObject({ ok: false, error: { code: "git_changed_paths_failed" } });
		commands.assertDone();
	});
});

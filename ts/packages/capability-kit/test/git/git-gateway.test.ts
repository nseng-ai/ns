import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import {
	GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS,
	RealGitGateway,
} from "@nseng-ai/capability-kit/git";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";

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
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: readonly ScriptedExec[]) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const missingStepMessage = `unexpected exec: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}
		if ("error" in expected) throw expected.error;
		return execResult(expected.result);
	}

	assertDone(): void {
		this.script.assertDone();
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

	test("resolves git common dir with command protocol", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--git-common-dir"], { stdout: ".git\n" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.gitCommonDir({ cwd: "/work" })).toEqual({ ok: true, value: "/work/.git" });
		commands.assertDone();
		expect(commands.execCalls).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--git-common-dir"],
				options: { cwd: "/work", timeout: 10_000 },
			},
		]);
	});

	test("resolves previous branch as optional command protocol", async () => {
		const commands = new ScriptedCommands([
			step("git", ["rev-parse", "--abbrev-ref", "@{-1}"], { stdout: "feature/previous\n" }),
			step("git", ["rev-parse", "--abbrev-ref", "@{-1}"], { code: 128, stderr: "no reflog" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.previousBranch({ cwd: "/work" })).toEqual({
			type: "found",
			value: "feature/previous",
		});
		expect(await git.previousBranch({ cwd: "/work" })).toEqual({ type: "missing" });
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["rev-parse", "--abbrev-ref", "@{-1}"],
			["rev-parse", "--abbrev-ref", "@{-1}"],
		]);
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
			error: { code: "current-branch-failed" },
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
			step("git", ["status", "--porcelain", "--", ".ns/objectives"], {
				stdout: " M .ns/objectives/a/objective.md\n",
			}),
			step("git", [...GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS], {
				stdout:
					"feature/a\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\t2026-06-15T12:00:00+00:00\nfeature/b\tbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\t\n\n",
			}),
			step("git", ["rev-parse", "refs/heads/main:.ns/objectives"], { stdout: "tree-main\n" }),
			step("git", ["rev-parse", "refs/heads/feature:.ns/objectives"], {
				stderr: "fatal: path '.ns/objectives' does not exist in 'refs/heads/feature'",
				code: 128,
			}),
			step("git", ["diff", "--name-only", "main..feature", "--", ".ns/objectives"], {
				stdout: " .ns/objectives/a/objective.md\n\n.ns/objectives/b/roadmap.md\n",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(
			await git.hasUncommittedChangesUnder({
				cwd: ROOT,
				relativePath: ".ns/objectives",
				signal: controller.signal,
			}),
		).toEqual({ ok: true, value: true });
		expect(await git.listLocalBranchTips({ cwd: ROOT })).toEqual({
			ok: true,
			value: [
				{
					name: "feature/a",
					headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					headIso: "2026-06-15T12:00:00+00:00",
				},
				{
					name: "feature/b",
					headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					headIso: null,
				},
			],
		});
		expect(
			await git.treeOidsAtRefs({
				cwd: ROOT,
				refs: ["refs/heads/main", "refs/heads/feature"],
				relativePath: ".ns/objectives",
			}),
		).toEqual({
			ok: true,
			value: { "refs/heads/main": "tree-main", "refs/heads/feature": null },
		});
		expect(
			await git.changedPathsUnder({
				cwd: ROOT,
				revisionRange: "main..feature",
				relativePath: ".ns/objectives",
			}),
		).toEqual({
			ok: true,
			value: [".ns/objectives/a/objective.md", ".ns/objectives/b/roadmap.md"],
		});
		commands.assertDone();
		expect(commands.execCalls[0]).toEqual({
			command: "git",
			args: ["status", "--porcelain", "--", ".ns/objectives"],
			options: { cwd: ROOT, timeout: 10_000, signal: controller.signal },
		});
		expect(commands.execCalls.map((call) => call.options?.timeout)).toEqual([
			10_000, 10_000, 10_000, 10_000, 10_000,
		]);
	});

	test("reports generic git fact failures", async () => {
		const commands = new ScriptedCommands([
			step("git", ["status", "--porcelain", "--", ".ns/objectives"], {
				code: 2,
				stderr: "bad status",
			}),
			errorStep("git", [...GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS], new Error("spawn ENOENT")),
			step("git", ["rev-parse", "HEAD:.ns/objectives"], { code: 2, stderr: "unexpected" }),
			step("git", ["diff", "--name-only", "main..feature", "--", ".ns/objectives"], {
				killed: true,
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(
			await git.hasUncommittedChangesUnder({ cwd: ROOT, relativePath: ".ns/objectives" }),
		).toMatchObject({ ok: false, error: { code: "git_dirty_status_failed" } });
		expect(await git.listLocalBranchTips({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_startup_failed" },
		});
		expect(
			await git.treeOidsAtRefs({ cwd: ROOT, refs: ["HEAD"], relativePath: ".ns/objectives" }),
		).toMatchObject({ ok: false, error: { code: "git_tree_oid_failed" } });
		expect(
			await git.changedPathsUnder({
				cwd: ROOT,
				revisionRange: "main..feature",
				relativePath: ".ns/objectives",
			}),
		).toMatchObject({ ok: false, error: { code: "git_changed_paths_failed" } });
		commands.assertDone();
	});

	test("parses status paths from NUL-delimited porcelain v1 output", async () => {
		const commands = new ScriptedCommands([
			step("git", ["status", "--porcelain=v1", "-z"], {
				stdout: [
					"M  staged.ts",
					" M unstaged.ts",
					"R  renamed.ts",
					"old.ts",
					"?? fresh.ts",
					"",
				].join("\0"),
			}),
			step("git", ["status", "--porcelain=v1", "-z", "--", ".ns/objectives"], {
				stdout: " M .ns/objectives/alpha/objective.md\0",
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.statusPaths({ cwd: ROOT })).toEqual({
			ok: true,
			value: {
				changedPaths: ["staged.ts", "unstaged.ts", "renamed.ts", "fresh.ts"],
			},
		});
		expect(await git.statusPaths({ cwd: ROOT, pathspecs: [".ns/objectives"] })).toEqual({
			ok: true,
			value: { changedPaths: [".ns/objectives/alpha/objective.md"] },
		});
		commands.assertDone();
		expect(commands.execCalls).toEqual([
			{
				command: "git",
				args: ["status", "--porcelain=v1", "-z"],
				options: { cwd: ROOT, timeout: 10_000 },
			},
			{
				command: "git",
				args: ["status", "--porcelain=v1", "-z", "--", ".ns/objectives"],
				options: { cwd: ROOT, timeout: 10_000 },
			},
		]);
	});

	test("lists changed paths under a path including rename sources and destinations", async () => {
		const commands = new ScriptedCommands([
			step("git", ["diff", "--name-status", "-M", "main...HEAD", "--", ".ns/objectives"], {
				stdout: [
					"M\t.ns/objectives/alpha/objective.md",
					"R100\t.ns/objectives/old/objective.md\t.ns/objectives/new/objective.md",
					"",
				].join("\n"),
			}),
		]);
		const git = new RealGitGateway(commands);

		expect(
			await git.changedPathsUnderWithRenames({
				cwd: ROOT,
				revisionRange: "main...HEAD",
				relativePath: ".ns/objectives",
			}),
		).toEqual({
			ok: true,
			value: [
				".ns/objectives/alpha/objective.md",
				".ns/objectives/old/objective.md",
				".ns/objectives/new/objective.md",
			],
		});
		commands.assertDone();
	});

	test("maps status command and parse failures to distinct codes", async () => {
		const commands = new ScriptedCommands([
			step("git", ["status", "--porcelain=v1", "-z"], { code: 2, stderr: "bad status" }),
			step("git", ["status", "--porcelain=v1", "-z"], { stdout: "garbage-line\0" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.statusPaths({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_status_paths_failed" },
		});
		expect(await git.statusPaths({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_status_parse_failed" },
		});
		commands.assertDone();
	});

	test("stages explicit paths and refuses an empty list without running git", async () => {
		const commands = new ScriptedCommands([step("git", ["add", "--", "a.ts", "b/c.md"], {})]);
		const git = new RealGitGateway(commands);

		expect(await git.stagePaths({ cwd: ROOT, paths: [] })).toMatchObject({
			ok: false,
			error: { code: "git_stage_paths_failed" },
		});
		expect(await git.stagePaths({ cwd: ROOT, paths: ["a.ts", "b/c.md"] })).toEqual({ ok: true });
		commands.assertDone();
		expect(commands.execCalls).toEqual([
			{
				command: "git",
				args: ["add", "--", "a.ts", "b/c.md"],
				options: { cwd: ROOT, timeout: 10_000 },
			},
		]);
	});

	test("commits with a multi-line message as a single argument and returns the new HEAD", async () => {
		const message = "Add runner step\n\nBody line one.\n\nObjective-Runner-Step: my-objective";
		const commands = new ScriptedCommands([
			step("git", ["commit", "-m", message], {}),
			step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.commit({ cwd: ROOT, message })).toEqual({ ok: true, value: START_POINT });
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["commit", "-m", message],
			["rev-parse", "HEAD"],
		]);
	});

	test("maps commit failures to git_commit_failed", async () => {
		const commands = new ScriptedCommands([
			step("git", ["commit", "-m", "subject"], { code: 1, stderr: "nothing to commit" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.commit({ cwd: ROOT, message: "subject" })).toMatchObject({
			ok: false,
			error: { code: "git_commit_failed" },
		});
		commands.assertDone();
	});

	test("probes staged changes via the cached diff exit-code protocol", async () => {
		const commands = new ScriptedCommands([
			step("git", ["diff", "--cached", "--quiet", "--exit-code"], { code: 0 }),
			step("git", ["diff", "--cached", "--quiet", "--exit-code"], { code: 1 }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.hasStagedChanges({ cwd: ROOT })).toEqual({ ok: true, value: false });
		expect(await git.hasStagedChanges({ cwd: ROOT })).toEqual({ ok: true, value: true });
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["diff", "--cached", "--quiet", "--exit-code"],
			["diff", "--cached", "--quiet", "--exit-code"],
		]);
	});

	test("maps completed staged-changes probe failures and propagates startup failures", async () => {
		const commands = new ScriptedCommands([
			step("git", ["diff", "--cached", "--quiet", "--exit-code"], { code: 128, stderr: "boom" }),
			step("git", ["diff", "--cached", "--quiet", "--exit-code"], { killed: true }),
			errorStep("git", ["diff", "--cached", "--quiet", "--exit-code"], new Error("spawn ENOENT")),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.hasStagedChanges({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_staged_probe_failed" },
		});
		expect(await git.hasStagedChanges({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_staged_probe_failed" },
		});
		expect(await git.hasStagedChanges({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_startup_failed" },
		});
		commands.assertDone();
	});

	test("checks staged whitespace as a two-state cached diff", async () => {
		const commands = new ScriptedCommands([
			step("git", ["diff", "--cached", "--check"], { code: 0 }),
			step("git", ["diff", "--cached", "--check"], { code: 2, stderr: "trailing whitespace" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.checkStagedWhitespace({ cwd: ROOT })).toEqual({ ok: true });
		expect(await git.checkStagedWhitespace({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_staged_whitespace_failed" },
		});
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["diff", "--cached", "--check"],
			["diff", "--cached", "--check"],
		]);
	});

	test("unstages the index and reports reset failures", async () => {
		const commands = new ScriptedCommands([
			step("git", ["reset", "--"], { code: 0 }),
			step("git", ["reset", "--"], { code: 1, stderr: "reset failed" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.unstageAll({ cwd: ROOT })).toEqual({ ok: true });
		expect(await git.unstageAll({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_unstage_failed" },
		});
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["reset", "--"],
			["reset", "--"],
		]);
	});

	test("checks out a branch and reports checkout failures", async () => {
		const commands = new ScriptedCommands([
			step("git", ["checkout", BRANCH], { code: 0 }),
			step("git", ["checkout", BRANCH], { code: 1, stderr: "checkout failed" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.checkout({ cwd: ROOT, branch: BRANCH })).toEqual({ ok: true });
		expect(await git.checkout({ cwd: ROOT, branch: BRANCH })).toMatchObject({
			ok: false,
			error: { code: "git_checkout_failed" },
		});
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["checkout", BRANCH],
			["checkout", BRANCH],
		]);
	});
});

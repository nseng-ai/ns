import { describe, expect, test } from "bun:test";

import { RealPlannedBranchGitGateway } from "../../src/git-gateway.ts";
import type { ExecResult } from "../../src/command-runtime.ts";
import type { ExecOptions, PlanCommandExecApi } from "../../src/plan-persistence.ts";
import { InMemoryPlannedBranchGitGateway } from "../support/in-memory-git-gateway.ts";

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

class ScriptedCommands implements PlanCommandExecApi {
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

describe("in-memory planned-branch git gateway", () => {
	test("returns configured facts and records narrow logs", async () => {
		const git = new InMemoryPlannedBranchGitGateway({
			repoRoot: ROOT,
			sourceBranch: "feature/source-plan",
			implementationBranch: BRANCH,
			defaultBranch: "trunk",
			originUrl: "git@github.com:Owner/Repo.git\n",
			headCommit: START_POINT,
		});

		expect(await git.repoRoot({ cwd: "/work" })).toEqual({ ok: true, value: ROOT });
		expect(await git.sourceBranch({ cwd: "/work" })).toEqual({ ok: true, value: "feature/source-plan" });
		expect(await git.implementationBranch({ cwd: "/work" })).toEqual({ ok: true, value: BRANCH });
		expect(await git.defaultBranch({ cwd: "/work" })).toEqual({ type: "found", value: "trunk" });
		expect(await git.originUrl({ cwd: "/work" })).toEqual({ type: "found", value: "git@github.com:Owner/Repo.git\n" });
		expect(await git.headCommit({ cwd: "/work" })).toEqual({ ok: true, value: START_POINT });
		expect(git.repoRootCalls).toEqual([{ cwd: "/work" }]);
		expect(git.sourceBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(git.implementationBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(git.defaultBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(git.originUrlCalls).toEqual([{ cwd: "/work" }]);
		expect(git.headCommitCalls).toEqual([{ cwd: "/work" }]);
	});

	test("models branch validation, presence, and creation as state", async () => {
		const git = new InMemoryPlannedBranchGitGateway({ existingBranches: ["existing"], invalidBranchRefs: ["bad branch"] });

		expect(await git.validateBranchRef({ cwd: ROOT, branch: "bad branch" })).toMatchObject({ ok: false });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "existing" })).toMatchObject({ type: "present", refName: "refs/heads/existing" });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({ type: "absent", refName: `refs/heads/${BRANCH}` });
		expect(await git.createBranchAtHead({ cwd: ROOT, branch: BRANCH })).toEqual({ ok: true });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toMatchObject({ type: "present", refName: `refs/heads/${BRANCH}` });
		expect(git.existingBranches).toEqual(["existing", BRANCH].sort());
		expect(git.createBranchAtHeadCalls).toEqual([{ cwd: ROOT, branch: BRANCH }]);
	});
});

describe("real planned-branch git gateway", () => {
	test("preserves repo root command protocol", async () => {
		const commands = new ScriptedCommands([step("git", ["rev-parse", "--show-toplevel"], { stdout: `\n${ROOT}\n` })]);
		const git = new RealPlannedBranchGitGateway(commands);

		expect(await git.repoRoot({ cwd: "/work" })).toEqual({ ok: true, value: ROOT });
		commands.assertDone();
		expect(commands.execCalls).toEqual([{ command: "git", args: ["rev-parse", "--show-toplevel"], options: { cwd: "/work", timeout: 10_000 } }]);
	});

	test("softens optional repo root failures", async () => {
		const commands = new ScriptedCommands([errorStep("git", ["rev-parse", "--show-toplevel"], new Error("spawn ENOENT"))]);
		const git = new RealPlannedBranchGitGateway(commands);

		expect(await git.optionalRepoRoot({ cwd: "/work" })).toEqual({ type: "missing" });
		commands.assertDone();
	});

	test("preserves branch fact command protocols", async () => {
		const commands = new ScriptedCommands([
			step("git", ["branch", "--show-current"], { stdout: "feature/source-plan\n" }),
			step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${BRANCH}\n` }),
			step("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], { stdout: "origin/main\n" }),
			step("git", ["config", "--get", "remote.origin.url"], { stdout: "git@github.com:Owner/Repo.git\n" }),
			step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
		]);
		const git = new RealPlannedBranchGitGateway(commands);

		expect(await git.sourceBranch({ cwd: ROOT })).toEqual({ ok: true, value: "feature/source-plan" });
		expect(await git.implementationBranch({ cwd: ROOT })).toEqual({ ok: true, value: BRANCH });
		expect(await git.defaultBranch({ cwd: ROOT })).toEqual({ type: "found", value: "main" });
		expect(await git.originUrl({ cwd: ROOT })).toEqual({ type: "found", value: "git@github.com:Owner/Repo.git\n" });
		expect(await git.headCommit({ cwd: ROOT })).toEqual({ ok: true, value: START_POINT });
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["branch", "--show-current"],
			["symbolic-ref", "--short", "HEAD"],
			["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
			["config", "--get", "remote.origin.url"],
			["rev-parse", "HEAD"],
		]);
		expect(commands.execCalls.every((call) => call.options?.timeout === 10_000)).toBe(true);
	});

	test("treats missing origin URL and missing default branch as optional", async () => {
		const commands = new ScriptedCommands([
			step("git", ["config", "--get", "remote.origin.url"], { code: 1 }),
			step("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], { code: 1 }),
		]);
		const git = new RealPlannedBranchGitGateway(commands);

		expect(await git.originUrl({ cwd: ROOT })).toEqual({ type: "missing" });
		expect(await git.defaultBranch({ cwd: ROOT })).toEqual({ type: "missing" });
		commands.assertDone();
	});

	test("preserves branch ref, presence, and creation command protocols", async () => {
		const commands = new ScriptedCommands([
			step("git", ["check-ref-format", "--branch", BRANCH]),
			step("git", ["rev-parse", "--verify", `refs/heads/${BRANCH}`], { code: 1, stderr: "missing" }),
			step("git", ["branch", BRANCH, "HEAD"]),
		]);
		const git = new RealPlannedBranchGitGateway(commands);

		expect(await git.validateBranchRef({ cwd: ROOT, branch: BRANCH })).toEqual({ ok: true });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({ type: "absent", refName: `refs/heads/${BRANCH}` });
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
			step("git", ["rev-parse", "--verify", "refs/heads/missing"], { code: 128, stderr: "fatal: Needed a single revision" }),
		]);
		const git = new RealPlannedBranchGitGateway(commands);

		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({
			type: "present",
			refName: `refs/heads/${BRANCH}`,
			displayCommand: `git rev-parse --verify refs/heads/${BRANCH}`,
		});
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "missing" })).toEqual({ type: "absent", refName: "refs/heads/missing" });
		commands.assertDone();
	});
});

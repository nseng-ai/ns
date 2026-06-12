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
		const commands = new ScriptedCommands([step("git", ["rev-parse", "--show-toplevel"], { stdout: `\n${ROOT}\n` })]);
		const git = new RealGitGateway(commands);

		expect(await git.repoRoot({ cwd: "/work" })).toEqual({ ok: true, value: ROOT });
		commands.assertDone();
		expect(commands.execCalls).toEqual([{ command: "git", args: ["rev-parse", "--show-toplevel"], options: { cwd: "/work", timeout: 10_000 } }]);
	});

	test("softens optional repo root failures", async () => {
		const commands = new ScriptedCommands([errorStep("git", ["rev-parse", "--show-toplevel"], new Error("spawn ENOENT"))]);
		const git = new RealGitGateway(commands);

		expect(await git.optionalRepoRoot({ cwd: "/work" })).toEqual({ type: "missing" });
		commands.assertDone();
	});

	test("preserves branch fact command protocols", async () => {
		const commands = new ScriptedCommands([
			step("git", ["branch", "--show-current"], { stdout: "feature/source-plan\n" }),
			step("git", ["config", "--get", "remote.origin.url"], { stdout: "git@github.com:Owner/Repo.git\n" }),
			step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.currentBranch({ cwd: ROOT })).toEqual({ ok: true, value: "feature/source-plan" });
		expect(await git.originUrl({ cwd: ROOT })).toEqual({ type: "found", value: "git@github.com:Owner/Repo.git\n" });
		expect(await git.headCommit({ cwd: ROOT })).toEqual({ ok: true, value: START_POINT });
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["branch", "--show-current"],
			["config", "--get", "remote.origin.url"],
			["rev-parse", "HEAD"],
		]);
		expect(commands.execCalls.every((call) => call.options?.timeout === 10_000)).toBe(true);
	});

	test("reports detached current branch", async () => {
		const commands = new ScriptedCommands([step("git", ["branch", "--show-current"], { stdout: "\n" })]);
		const git = new RealGitGateway(commands);

		expect(await git.currentBranch({ cwd: ROOT })).toEqual({
			ok: false,
			error: {
				code: "detached_head",
				message: "git branch --show-current returned no current branch.\nCommand: git branch --show-current",
				displayCommand: "git branch --show-current",
			},
		});
		commands.assertDone();
	});

	test("treats missing origin URL as optional", async () => {
		const commands = new ScriptedCommands([step("git", ["config", "--get", "remote.origin.url"], { code: 1 })]);
		const git = new RealGitGateway(commands);

		expect(await git.originUrl({ cwd: ROOT })).toEqual({ type: "missing" });
		commands.assertDone();
	});

	test("resolves trunk branch through origin HEAD when candidate exists locally", async () => {
		const commands = new ScriptedCommands([
			step("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { stdout: "origin/trunk\n" }),
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
			step("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { stdout: "origin/develop\n" }),
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
			step("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { stdout: "origin/trunk\n" }),
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
			step("git", ["rev-parse", "--verify", "refs/heads/master"], { code: 128, stderr: "fatal: Needed a single revision" }),
		]);
		const git = new RealGitGateway(commands);

		expect(await git.trunkBranch({ cwd: ROOT })).toEqual({ type: "missing" });
		commands.assertDone();
	});

	test("preserves branch ref, presence, and creation command protocols", async () => {
		const commands = new ScriptedCommands([
			step("git", ["check-ref-format", "--branch", BRANCH]),
			step("git", ["rev-parse", "--verify", `refs/heads/${BRANCH}`], { code: 1, stderr: "missing" }),
			step("git", ["branch", BRANCH, "HEAD"]),
		]);
		const git = new RealGitGateway(commands);

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
		const git = new RealGitGateway(commands);

		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({
			type: "present",
			refName: `refs/heads/${BRANCH}`,
			displayCommand: `git rev-parse --verify refs/heads/${BRANCH}`,
		});
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "missing" })).toEqual({ type: "absent", refName: "refs/heads/missing" });
		commands.assertDone();
	});
});

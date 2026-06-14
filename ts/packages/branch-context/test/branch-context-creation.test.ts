import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	BRANCH_CONTEXT_NAMESPACE,
	createBranchContextFromFile,
	deriveTargetBranch,
	validateTargetBranchName,
	type CreateBranchContextFromFileParams,
} from "../src/branch-context-creation.ts";
import { createBranchContextContext, type BranchContextContext } from "@asdl/branch-context";
import type { CommandExecApi, ExecOptions } from "@asdl/core/exec";
import type { ExecResult } from "@asdl/core/exec";

const ROOT = "/repo";
const PLAN_SLUG = "branch-scoped-plan-extension";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_BRANCH = "source-branch";

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

class FakePi implements CommandExecApi {
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if ("error" in expected) {
			throw expected.error;
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
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

function gitRootStep(root: string = ROOT): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${root}\n` });
}

function refFormatStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["check-ref-format", "--branch", branch], result);
}

function headStep(result: Partial<ExecResult> = { stdout: `${START_POINT}\n` }): ScriptedExec {
	return step("git", ["rev-parse", "HEAD"], result);
}

function localBranchCheckStep(branch: string, result: Partial<ExecResult>): ScriptedExec {
	return step("git", ["rev-parse", "--verify", `refs/heads/${branch}`], result);
}

function brmemCheckStep(branch: string, key: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["check", key, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

function gitBranchStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["branch", branch, "HEAD"], result);
}

function currentBranchStep(branch: string = SOURCE_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${branch}\n`, ...result });
}

function gtInfoStep(branch: string = SOURCE_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("gt", ["info", branch, "--no-interactive"], result);
}

function gtTrackStep(branch: string, parent: string = SOURCE_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("gt", ["track", branch, "--parent", parent, "--no-interactive"], result);
}

function brmemPutStep(branch: string, key: string, filePath: string, result: Partial<ExecResult>): ScriptedExec {
	return step(
		"brmem",
		["put", key, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", branch, "--file", filePath, "--format", "json"],
		result,
	);
}

async function makeTempDir(prefix = "branch-context-create-"): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
	tempDirs.push(dir);
	return dir;
}

async function makePlanFile(content = "# Test Plan\n\nDo the work.\n"): Promise<string> {
	const dir = await makeTempDir();
	const filePath = join(dir, "plan.md");
	await writeFile(filePath, content, "utf8");
	return filePath;
}

function branchContext(pi: CommandExecApi): BranchContextContext {
	return createBranchContextContext(pi);
}

function putEnvelope(input: { branch: string; key: string; filePath: string; commit?: string; refName?: string }): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: input.key,
			branch: input.branch,
			ref_name: input.refName ?? `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
			commit: input.commit ?? "abc123",
			source_file: input.filePath,
		},
	});
}

function successScript(input: { branch: string; key: string; filePath: string; putStdout?: string }): ScriptedExec[] {
	return [
		gitRootStep(),
		refFormatStep(input.branch),
		headStep(),
		localBranchCheckStep(input.branch, { code: 1, stderr: "absent" }),
		brmemCheckStep(input.branch, input.key, { code: 1, stderr: "absent" }),
		gitBranchStep(input.branch),
		brmemPutStep(input.branch, input.key, input.filePath, {
			stdout: input.putStdout ?? putEnvelope({ branch: input.branch, key: input.key, filePath: input.filePath }),
		}),
	];
}

function graphiteSuccessScript(input: { branch: string; key: string; filePath: string; putStdout?: string }): ScriptedExec[] {
	return [
		gitRootStep(),
		refFormatStep(input.branch),
		headStep(),
		localBranchCheckStep(input.branch, { code: 1, stderr: "absent" }),
		brmemCheckStep(input.branch, input.key, { code: 1, stderr: "absent" }),
		currentBranchStep(),
		gtInfoStep(),
		gitBranchStep(input.branch),
		gtTrackStep(input.branch),
		brmemPutStep(input.branch, input.key, input.filePath, {
			stdout: input.putStdout ?? putEnvelope({ branch: input.branch, key: input.key, filePath: input.filePath }),
		}),
	];
}

async function runCreate(
	params: CreateBranchContextFromFileParams,
	script: ScriptedExec[],
): Promise<{ pi: FakePi; evidence: Awaited<ReturnType<typeof createBranchContextFromFile>> }> {
	const pi = new FakePi(script);
	const evidence = await createBranchContextFromFile(pi, params, { cwd: ROOT, context: branchContext(pi) });
	return { pi, evidence };
}

describe("branch name helpers", () => {
	test("deriveTargetBranch defaults to slug and trims explicit branch names", () => {
		expect(deriveTargetBranch(undefined, PLAN_SLUG)).toBe(PLAN_SLUG);
		expect(deriveTargetBranch("   ", PLAN_SLUG)).toBe(PLAN_SLUG);
		expect(deriveTargetBranch("  branch-contexts/add-branch-core  ", PLAN_SLUG)).toBe("branch-contexts/add-branch-core");
	});

	test("validateTargetBranchName catches deterministic unsafe names", () => {
		for (const branch of ["", "-bad", "bad branch", "/bad", "bad/", "bad//branch", "bad..branch", "bad@{1}", "bad.lock"]) {
			expect(validateTargetBranchName(branch)).toBeDefined();
		}
		expect(validateTargetBranchName("branch-contexts/add-branch-core")).toBeUndefined();
	});
});

describe("createBranchContextFromFile", () => {
	test("creates a branch context with the default branch name equal to the slug", async () => {
		const filePath = await makePlanFile();
		const { pi, evidence } = await runCreate(
			{ slug: PLAN_SLUG, filePath, summary: "Store the plan on a new branch." },
			successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath }),
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["check-ref-format", "--branch", PLAN_SLUG] },
			{ command: "git", args: ["rev-parse", "HEAD"] },
			{ command: "git", args: ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`] },
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", PLAN_SLUG, "--format", "json"] },
			{ command: "git", args: ["branch", PLAN_SLUG, "HEAD"] },
			{
				command: "brmem",
				args: ["put", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", PLAN_SLUG, "--file", filePath, "--format", "json"],
			},
		]);
		expect(evidence).toEqual({
			slug: PLAN_SLUG,
			branch: PLAN_SLUG,
			branchCreation: "plain-git",
			startPoint: START_POINT,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: PLAN_KEY,
			refName: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${PLAN_SLUG}:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: filePath,
			summary: "Store the plan on a new branch.",
		});
	});

	test("accepts explicit plain Git branch creation", async () => {
		const filePath = await makePlanFile();
		const { pi, evidence } = await runCreate(
			{ slug: PLAN_SLUG, filePath, branchCreation: "plain-git" },
			successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath }),
		);

		pi.assertDone();
		expect(evidence.branchCreation).toBe("plain-git");
		expect(pi.execCalls.map((call) => call.args)).toContainEqual(["branch", PLAN_SLUG, "HEAD"]);
	});

	test("uses an explicit branch name without changing the storage key", async () => {
		const filePath = await makePlanFile();
		const branch = "branch-contexts/add-branch-context-core";
		const { pi, evidence } = await runCreate(
			{ slug: PLAN_SLUG, filePath, branchName: `  ${branch}  ` },
			successScript({ branch, key: PLAN_KEY, filePath }),
		);

		pi.assertDone();
		expect(evidence.branch).toBe(branch);
		expect(evidence.key).toBe(PLAN_KEY);
		expect(pi.execCalls.map((call) => call.args)).toContainEqual(["branch", branch, "HEAD"]);
		expect(pi.execCalls.map((call) => call.args)).toContainEqual([
			"put",
			PLAN_KEY,
			"--namespace",
			BRANCH_CONTEXT_NAMESPACE,
			"--branch",
			branch,
			"--file",
			filePath,
			"--format",
			"json",
		]);
	});

	test("creates a Graphite branch context with an explicit prefixed branch name", async () => {
		const filePath = await makePlanFile();
		const branch = `branch-contexts/${PLAN_SLUG}`;
		const { pi, evidence } = await runCreate(
			{
				slug: PLAN_SLUG,
				filePath,
				branchName: branch,
				branchCreation: "graphite",
				summary: "Store the plan on a Graphite branch.",
			},
			graphiteSuccessScript({ branch, key: PLAN_KEY, filePath }),
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["check-ref-format", "--branch", branch] },
			{ command: "git", args: ["rev-parse", "HEAD"] },
			{ command: "git", args: ["rev-parse", "--verify", `refs/heads/${branch}`] },
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", branch, "--format", "json"] },
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "gt", args: ["info", SOURCE_BRANCH, "--no-interactive"] },
			{ command: "git", args: ["branch", branch, "HEAD"] },
			{ command: "gt", args: ["track", branch, "--parent", SOURCE_BRANCH, "--no-interactive"] },
			{
				command: "brmem",
				args: ["put", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", branch, "--file", filePath, "--format", "json"],
			},
		]);
		expect(evidence.branchCreation).toBe("graphite");
		expect(evidence.branch).toBe(branch);
	});

	test("refuses Graphite branch creation from a detached checkout before creating the branch", async () => {
		const filePath = await makePlanFile();
		const branch = `branch-contexts/${PLAN_SLUG}`;
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(branch),
			headStep(),
			localBranchCheckStep(branch, { code: 1 }),
			brmemCheckStep(branch, PLAN_KEY, { code: 1 }),
			currentBranchStep("", { stdout: "\n" }),
		]);

		await expect(
			createBranchContextFromFile(pi, { slug: PLAN_SLUG, filePath, branchName: branch, branchCreation: "graphite" }, { cwd: ROOT, context: branchContext(pi) }),
		).rejects.toThrow("Graphite branch creation requires a named current branch");

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual(["branch", branch, "HEAD"]);
		expect(pi.execCalls.some((call) => call.command === "gt")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "put")).toBe(false);
	});

	test("refuses Graphite branch creation from an untracked parent before creating the branch", async () => {
		const filePath = await makePlanFile();
		const branch = `branch-contexts/${PLAN_SLUG}`;
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(branch),
			headStep(),
			localBranchCheckStep(branch, { code: 1 }),
			brmemCheckStep(branch, PLAN_KEY, { code: 1 }),
			currentBranchStep(),
			gtInfoStep(SOURCE_BRANCH, { code: 1, stderr: `ERROR: Cannot perform this operation on untracked branch ${SOURCE_BRANCH}.` }),
		]);

		await expect(
			createBranchContextFromFile(pi, { slug: PLAN_SLUG, filePath, branchName: branch, branchCreation: "graphite" }, { cwd: ROOT, context: branchContext(pi) }),
		).rejects.toThrow("Current branch is not tracked by Graphite; refusing to stack a branch context on it.");

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual(["branch", branch, "HEAD"]);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "track")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "put")).toBe(false);
	});

	test("surfaces Graphite track failures before storing Branch Memory", async () => {
		const filePath = await makePlanFile();
		const branch = `branch-contexts/${PLAN_SLUG}`;
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(branch),
			headStep(),
			localBranchCheckStep(branch, { code: 1 }),
			brmemCheckStep(branch, PLAN_KEY, { code: 1 }),
			currentBranchStep(),
			gtInfoStep(),
			gitBranchStep(branch),
			gtTrackStep(branch, SOURCE_BRANCH, { code: 1, stderr: "current branch is not tracked" }),
		]);

		await expect(
			createBranchContextFromFile(
				pi,
				{
					slug: PLAN_SLUG,
					filePath,
					branchName: branch,
					branchCreation: "graphite",
					summary: "Store the plan on a Graphite branch.",
				},
				{ cwd: ROOT, context: branchContext(pi) },
			),
		).rejects.toThrow("gt track failed");

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual([
			"put",
			PLAN_KEY,
			"--namespace",
			BRANCH_CONTEXT_NAMESPACE,
			"--branch",
			branch,
			"--file",
			filePath,
			"--format",
			"json",
		]);
	});

	test("reports partial state when brmem put fails after Graphite branch creation", async () => {
		const filePath = await makePlanFile();
		const branch = `branch-contexts/${PLAN_SLUG}`;
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(branch),
			headStep(),
			localBranchCheckStep(branch, { code: 1 }),
			brmemCheckStep(branch, PLAN_KEY, { code: 1 }),
			currentBranchStep(),
			gtInfoStep(),
			gitBranchStep(branch),
			gtTrackStep(branch),
			brmemPutStep(branch, PLAN_KEY, filePath, { code: 2, stderr: "write failed" }),
		]);

		await expect(
			createBranchContextFromFile(
				pi,
				{
					slug: PLAN_SLUG,
					filePath,
					branchName: branch,
					branchCreation: "graphite",
					summary: "Store the plan on a Graphite branch.",
				},
				{ cwd: ROOT, context: branchContext(pi) },
			),
		).rejects.toThrow(
			new RegExp(
				`Partial failure:[\\s\\S]*Created branch: ${branch}[\\s\\S]*Branch creation: graphite[\\s\\S]*Start point: ${START_POINT}[\\s\\S]*Key: ${PLAN_KEY}[\\s\\S]*Source file: ${filePath}`,
			),
		);

		pi.assertDone();
	});

	test("trims blank summaries from Graphite evidence", async () => {
		const filePath = await makePlanFile();
		const branch = `branch-contexts/${PLAN_SLUG}`;
		const { pi, evidence } = await runCreate(
			{ slug: PLAN_SLUG, filePath, branchName: branch, branchCreation: "graphite", summary: "   " },
			graphiteSuccessScript({ branch, key: PLAN_KEY, filePath }),
		);

		pi.assertDone();
		expect(evidence.branchCreation).toBe("graphite");
		expect(evidence.summary).toBeUndefined();
	});

	test("rejects a missing source plan path before running commands", async () => {
		const missingPathPi = new FakePi();
		await expect(
			createBranchContextFromFile(
				missingPathPi,
				{ slug: PLAN_SLUG, filePath: join(await makeTempDir(), "missing.md") },
				{ cwd: ROOT, context: branchContext(missingPathPi) },
			),
		).rejects.toThrow("Plan file does not exist");
		expect(missingPathPi.execCalls).toEqual([]);
	});

	test("aborts an existing local branch before Branch Memory preflight or branch creation", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(PLAN_SLUG),
			headStep(),
			localBranchCheckStep(PLAN_SLUG, { code: 0, stdout: START_POINT }),
		]);

		await expect(createBranchContextFromFile(pi, { slug: PLAN_SLUG, filePath }, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(
			"Target branch already exists",
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual([
			"check",
			PLAN_KEY,
			"--namespace",
			BRANCH_CONTEXT_NAMESPACE,
			"--branch",
			PLAN_SLUG,
			"--format",
			"json",
		]);
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual(["branch", PLAN_SLUG, "HEAD"]);
	});

	test("aborts an existing Branch Memory entry before branch creation", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(PLAN_SLUG),
			headStep(),
			localBranchCheckStep(PLAN_SLUG, { code: 1 }),
			brmemCheckStep(PLAN_SLUG, PLAN_KEY, { code: 0, stdout: "{}" }),
		]);

		await expect(createBranchContextFromFile(pi, { slug: PLAN_SLUG, filePath }, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(
			"Attached plan already exists on target branch",
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual(["branch", PLAN_SLUG, "HEAD"]);
	});

	test("aborts before branch creation when no brmem command is available for preflight", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(PLAN_SLUG),
			headStep(),
			localBranchCheckStep(PLAN_SLUG, { code: 1, stderr: "absent" }),
			brmemCheckStep(PLAN_SLUG, PLAN_KEY, { code: 127, stderr: "brmem: command not found" }),
		]);

		await expect(createBranchContextFromFile(pi, { slug: PLAN_SLUG, filePath }, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(
			"No brmem command available",
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual(["branch", PLAN_SLUG, "HEAD"]);
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "put")).toBe(false);
	});

	test("surfaces branch creation failure", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(PLAN_SLUG),
			headStep(),
			localBranchCheckStep(PLAN_SLUG, { code: 1 }),
			brmemCheckStep(PLAN_SLUG, PLAN_KEY, { code: 1 }),
			gitBranchStep(PLAN_SLUG, { code: 128, stderr: "cannot lock ref" }),
		]);

		await expect(createBranchContextFromFile(pi, { slug: PLAN_SLUG, filePath }, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(
			"git branch failed",
		);

		pi.assertDone();
	});

	test("reports partial state when brmem put fails after branch creation", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(PLAN_SLUG),
			headStep(),
			localBranchCheckStep(PLAN_SLUG, { code: 1 }),
			brmemCheckStep(PLAN_SLUG, PLAN_KEY, { code: 1 }),
			gitBranchStep(PLAN_SLUG),
			brmemPutStep(PLAN_SLUG, PLAN_KEY, filePath, { code: 2, stderr: "write failed" }),
		]);

		await expect(createBranchContextFromFile(pi, { slug: PLAN_SLUG, filePath }, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(
			new RegExp(`Partial failure:[\\s\\S]*Created branch: ${PLAN_SLUG}[\\s\\S]*Start point: ${START_POINT}[\\s\\S]*Key: ${PLAN_KEY}[\\s\\S]*Source file: ${filePath}`),
		);

		pi.assertDone();
	});

	test("reports partial state when no brmem command is available after branch creation", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(PLAN_SLUG),
			headStep(),
			localBranchCheckStep(PLAN_SLUG, { code: 1 }),
			brmemCheckStep(PLAN_SLUG, PLAN_KEY, { code: 1 }),
			gitBranchStep(PLAN_SLUG),
			brmemPutStep(PLAN_SLUG, PLAN_KEY, filePath, { code: 127, stderr: "brmem: command not found" }),
		]);

		await expect(createBranchContextFromFile(pi, { slug: PLAN_SLUG, filePath }, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(
			new RegExp(
				`Partial failure:[\\s\\S]*Created branch: ${PLAN_SLUG}[\\s\\S]*Start point: ${START_POINT}[\\s\\S]*Namespace: ${BRANCH_CONTEXT_NAMESPACE}[\\s\\S]*Key: ${PLAN_KEY}[\\s\\S]*Source file: ${filePath}[\\s\\S]*No cleanup was attempted[\\s\\S]*No brmem command available`,
			),
		);

		pi.assertDone();
	});

	test("reports partial state when brmem put JSON is malformed after branch creation", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi(successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath, putStdout: "not json" }));

		await expect(createBranchContextFromFile(pi, { slug: PLAN_SLUG, filePath }, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(
			/Partial failure:[\s\S]*No cleanup was attempted[\s\S]*Malformed brmem put JSON/,
		);

		pi.assertDone();
	});
});

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runCli } from "../../src/cli.ts";
import { PLAN_BRANCH_NAMESPACE } from "../../src/constants.ts";
import { encodeBranchForPlanPath } from "../../src/source-plan-file.ts";
import type { ExecResult } from "../../src/command-runtime.ts";
import type { ExecOptions, PlanCommandExecApi } from "../../src/plan-persistence.ts";
import { InMemoryPlannedBranchBrmemGateway, type InMemoryBrmemGatewayState } from "../support/in-memory-brmem-gateway.ts";
import { InMemoryPlannedBranchGitGateway, type InMemoryGitGatewayState } from "../support/in-memory-git-gateway.ts";
import { InMemoryPlannedBranchGraphiteGateway, type InMemoryGraphiteGatewayState } from "../support/in-memory-graphite-gateway.ts";

const SOURCE_BRANCH = "feature/source-plan";
const PLAN_SLUG = "branch-scoped-plan";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const START_POINT = "0123456789abcdef0123456789abcdef01234567";

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

class FakeCommands implements PlanCommandExecApi {
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

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	commands: FakeCommands;
	git: InMemoryPlannedBranchGitGateway;
	brmem: InMemoryPlannedBranchBrmemGateway;
	graphite: InMemoryPlannedBranchGraphiteGateway;
}

interface RunWithFakesOptions {
	cwd: string;
	stdin?: string;
	planStoreRoot?: string;
	git?: InMemoryGitGatewayState;
	brmem?: InMemoryBrmemGatewayState;
	graphite?: InMemoryGraphiteGatewayState;
}

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix = "planned-branch-cli-"): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
	tempDirs.push(dir);
	return dir;
}

function runWithFakes(args: readonly string[], script: readonly ScriptedExec[] = [], options: RunWithFakesOptions): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const commands = new FakeCommands(script);
	const git = new InMemoryPlannedBranchGitGateway({
		repoRoot: options.cwd,
		optionalRepoRoot: options.cwd,
		sourceBranch: SOURCE_BRANCH,
		...(options.git ?? {}),
	});
	const brmem = new InMemoryPlannedBranchBrmemGateway(options.brmem);
	const graphite = new InMemoryPlannedBranchGraphiteGateway(options.graphite);
	return {
		stdout,
		stderr,
		commands,
		git,
		brmem,
		graphite,
		exit: runCli(args, {
			context: { commands, git, brmem, graphite },
			cwd: options.cwd,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			stdin: async () => options.stdin ?? "",
			...(options.planStoreRoot === undefined ? {} : { planStoreRoot: options.planStoreRoot }),
		}),
	};
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

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseJson(run: CliRun): Record<string, unknown> {
	return JSON.parse(run.stdout.join("")) as Record<string, unknown>;
}

describe("planned-branch CLI help", () => {
	test("prints top-level help, version, and exec help", async () => {
		const repoRoot = await makeTempDir();
		const help = runWithFakes(["--help"], [], { cwd: repoRoot });
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: planned-branch");
		expect(help.stdout.join("")).toContain("exec");

		const version = runWithFakes(["--version"], [], { cwd: repoRoot });
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");

		const execHelp = runWithFakes(["exec", "--help"], [], { cwd: repoRoot });
		expect(await execHelp.exit).toBe(0);
		expect(execHelp.stdout.join("")).toContain("write-plan-file");
		expect(execHelp.stdout.join("")).toContain("load-plan");
	});
});

describe("planned-branch CLI parse failures", () => {
	test("reports missing flag values as human errors without running commands", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "create", "--slug"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Error: --slug requires a value.\n");
		expect(run.commands.execCalls).toEqual([]);
	});

	test("reports missing flag values as JSON errors without running commands", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "create", "--slug", "--format", "json"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(parseJson(run)).toEqual({
			success: false,
			error: { code: "planned_branch_error", message: "--slug requires a value." },
		});
		expect(run.stderr.join("")).toBe("");
		expect(run.commands.execCalls).toEqual([]);
	});

	test("reports malformed arguments as human errors without running commands", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "load-plan", "--bogus"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Error: Unknown option: --bogus\n");
		expect(run.commands.execCalls).toEqual([]);
	});

	test("reports malformed arguments as JSON errors without running commands", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "load-plan", "--format", "json", "--bogus"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(parseJson(run)).toEqual({
			success: false,
			error: { code: "planned_branch_error", message: "Unknown option: --bogus" },
		});
		expect(run.stderr.join("")).toBe("");
		expect(run.commands.execCalls).toEqual([]);
	});
});

describe("planned-branch exec", () => {
	test("write-plan-file stores stdin content under the planned-branch local store", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const run = runWithFakes(["exec", "write-plan-file", "--slug", PLAN_SLUG, "--summary", "Save it", "--stdin", "--format", "json"], [], {
			cwd: repoRoot,
			stdin: "# Plan\n\nDo it.\n",
			planStoreRoot,
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			success: true,
			slug: PLAN_SLUG,
			repo_key: "gh--owner--repo",
			source_branch: SOURCE_BRANCH,
			branch_key: encodeBranchForPlanPath(SOURCE_BRANCH),
			summary: "Save it",
		});
		expect(String(payload.file_path)).toContain(`${planStoreRoot}/gh--owner--repo/${encodeBranchForPlanPath(SOURCE_BRANCH)}/${PLAN_KEY}`);
		expect(await readFile(String(payload.file_path), "utf8")).toBe("# Plan\n\nDo it.\n");
	});

	test("resolve-plan returns explicit paths and the latest saved source-branch plan", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const explicitPlan = join(outsideDir, "explicit.md");
		await writeFile(explicitPlan, "# Explicit\n", "utf8");
		const explicit = runWithFakes(["exec", "resolve-plan", explicitPlan, "--format", "json"], [], { cwd: repoRoot });
		expect(await explicit.exit).toBe(0);
		expect(parseJson(explicit)).toMatchObject({ success: true, source: "explicit", file_path: explicitPlan });

		const planStoreRoot = await makeTempDir();
		const planDirectory = join(planStoreRoot, "gh--owner--repo", encodeBranchForPlanPath(SOURCE_BRANCH));
		await mkdir(planDirectory, { recursive: true });
		const older = join(planDirectory, "older-plan-file.md");
		const newer = join(planDirectory, "newer-plan-file.md");
		await writeFile(older, "older", "utf8");
		await writeFile(newer, "newer", "utf8");
		await utimes(older, new Date(1_000), new Date(1_000));
		await utimes(newer, new Date(2_000), new Date(2_000));

		const latest = runWithFakes(["exec", "resolve-plan", "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
		});
		expect(await latest.exit).toBe(0);
		expect(parseJson(latest)).toMatchObject({ success: true, source: "latest", slug: "newer-plan-file", file_path: newer });
	});

	test("create makes a plain git branch and attaches the plan in the planned-branch namespace", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "planned-branches/branch-scoped-plan";
		const run = runWithFakes(
			["exec", "create", "--slug", PLAN_SLUG, "--plan-file", planFile, "--branch", branch, "--summary", "Create it", "--format", "json"],
			[],
			{ cwd: repoRoot, git: { headCommit: START_POINT } },
		);

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		expect(parseJson(run)).toMatchObject({
			success: true,
			slug: PLAN_SLUG,
			branch,
			branch_creation: "plain-git",
			start_point: START_POINT,
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			source_file: planFile,
			summary: "Create it",
		});
		expect(run.brmem.attachmentPresenceCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY }]);
		expect(run.brmem.attachPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY, sourceFile: planFile }]);
		expect(run.graphite.trackBranchCalls).toEqual([]);
		expect(run.brmem.attachedPlans).toContainEqual({
			branch,
			key: PLAN_KEY,
			content: "",
			refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${branch.replaceAll("/", "---")}:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: planFile,
		});
	});

	test("create tracks Graphite branches through the semantic gateway", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "planned-branches/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"create",
				"--slug",
				PLAN_SLUG,
				"--plan-file",
				planFile,
				"--branch",
				branch,
				"--branch-creation",
				"graphite",
				"--format",
				"json",
			],
			[],
			{ cwd: repoRoot, git: { headCommit: START_POINT } },
		);

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		expect(parseJson(run)).toMatchObject({
			success: true,
			slug: PLAN_SLUG,
			branch,
			branch_creation: "graphite",
			start_point: START_POINT,
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			source_file: planFile,
		});
		expect(run.graphite.trackBranchCalls).toEqual([{ cwd: repoRoot, branch, parentBranch: SOURCE_BRANCH }]);
		expect(run.brmem.attachPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY, sourceFile: planFile }]);
	});

	test("Graphite tracking failures keep the local branch and skip Branch Memory attach", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "planned-branches/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"create",
				"--slug",
				PLAN_SLUG,
				"--plan-file",
				planFile,
				"--branch",
				branch,
				"--branch-creation",
				"graphite",
				"--format",
				"json",
			],
			[],
			{
				cwd: repoRoot,
				git: { headCommit: START_POINT },
				graphite: { trackFailure: { code: "graphite_track_failed", message: "gt track failed (exit code 2)." } },
			},
		);

		expect(await run.exit).toBe(2);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload.success).toBe(false);
		expect(String((payload.error as { message: string }).message)).toContain("Created local Git branch but failed to track it with Graphite.");
		expect(String((payload.error as { message: string }).message)).toContain(`Branch: ${branch}`);
		expect(String((payload.error as { message: string }).message)).toContain("No attached plan was stored.");
		expect(String((payload.error as { message: string }).message)).toContain("gt track failed");
		expect(run.git.existingBranches).toContain(branch);
		expect(run.graphite.trackBranchCalls).toEqual([{ cwd: repoRoot, branch, parentBranch: SOURCE_BRANCH }]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("load-plan selects the attached plan and returns an implementation prompt", async () => {
		const repoRoot = await makeTempDir();
		const branch = "planned-branches/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const run = runWithFakes(["exec", "load-plan", PLAN_SLUG, "--format", "json"], [], {
			cwd: repoRoot,
			git: { implementationBranch: branch, defaultBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			success: true,
			branch,
			namespace: PLAN_BRANCH_NAMESPACE,
			selected_key: PLAN_KEY,
			attached_plan_content: content,
		});
		expect(String(payload.implementation_prompt)).toContain("# planned-branch implementation");
		expect(String(payload.implementation_prompt)).toContain("----- BEGIN ATTACHED PLAN -----\n# Attached Plan");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ cwd: repoRoot, branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY }]);
	});
});

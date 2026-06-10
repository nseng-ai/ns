import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runCli } from "../../src/cli.ts";
import { PLAN_BRANCH_NAMESPACE } from "../../src/constants.ts";
import { encodeBranchForPlanPath } from "@asdl/plans";
import type { ExecResult } from "@asdl/plans";
import type { ExecOptions, PlanCommandExecApi } from "@asdl/plans";
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
	const value: unknown = JSON.parse(run.stdout.join(""));
	if (!isRecord(value)) {
		throw new Error("Expected JSON object output.");
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function expectNoGitOrBrmemCalls(run: CliRun): void {
	expect(run.git.repoRootCalls).toEqual([]);
	expect(run.git.optionalRepoRootCalls).toEqual([]);
	expect(run.git.sourceBranchCalls).toEqual([]);
	expect(run.git.implementationBranchCalls).toEqual([]);
	expect(run.git.defaultBranchCalls).toEqual([]);
	expect(run.git.originUrlCalls).toEqual([]);
	expect(run.git.headCommitCalls).toEqual([]);
	expect(run.git.validateBranchRefCalls).toEqual([]);
	expect(run.git.localBranchPresenceCalls).toEqual([]);
	expect(run.git.createBranchAtHeadCalls).toEqual([]);
	expect(run.brmem.attachmentPresenceCalls).toEqual([]);
	expect(run.brmem.attachPlanCalls).toEqual([]);
	expect(run.brmem.listAttachedPlansCalls).toEqual([]);
	expect(run.brmem.getAttachedPlanCalls).toEqual([]);
}

describe("planned-branch CLI help", () => {
	test("prints top-level help, version, and exec help", async () => {
		const repoRoot = await makeTempDir();
		const help = runWithFakes(["--help"], [], { cwd: repoRoot });
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: planned-branch");
		expect(help.stdout.join("")).toContain("--runtime");
		expect(help.stdout.join("")).toContain("exec");

		const version = runWithFakes(["--version"], [], { cwd: repoRoot });
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");

		const runtime = runWithFakes(["--runtime"], [], { cwd: repoRoot });
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe(
			"runtime: typescript\nentry_point: @asdl/planned-branch bin planned-branch -> ts/packages/planned-branch/src/cli.ts\n",
		);
		expectNoGitOrBrmemCalls(runtime);

		const execHelp = runWithFakes(["exec", "--help"], [], { cwd: repoRoot });
		expect(await execHelp.exit).toBe(0);
		expect(execHelp.stdout.join("")).toContain("create");
		expect(execHelp.stdout.join("")).toContain("load-plan");
		expect(execHelp.stdout.join("")).not.toContain("write-plan-file");
		expect(execHelp.stdout.join("")).not.toContain("resolve-plan");
		expect(execHelp.stdout.join("")).not.toContain("preview-ts");
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

	test("rejects JSON-only load-plan fields in text mode before loading a plan", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "load-plan", PLAN_SLUG, "--include-content"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Error: --include-content and --include-prompt require --format json.\n");
		expect(run.commands.execCalls).toEqual([]);
		expect(run.brmem.listAttachedPlansCalls).toEqual([]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([]);
	});
});

describe("planned-branch exec", () => {
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

	test("load-plan JSON is metadata-only by default", async () => {
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
			byte_count: content.length,
			source: "attached",
		});
		expect(payload).not.toHaveProperty("attached_plan_content");
		expect(payload).not.toHaveProperty("implementation_prompt");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ cwd: repoRoot, branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY }]);
	});

	test("load-plan falls back to the latest saved source-branch plan when no plan is attached", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planDirectory = join(planStoreRoot, "gh--owner--repo", encodeBranchForPlanPath(SOURCE_BRANCH));
		await mkdir(planDirectory, { recursive: true });
		const planFile = join(planDirectory, PLAN_KEY);
		const content = "# Saved Plan\n\n- Implement directly from the saved plan.\n";
		await writeFile(planFile, content, "utf8");
		const run = runWithFakes(["exec", "load-plan", "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
			git: { implementationBranch: SOURCE_BRANCH, defaultBranch: "main" },
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		expect(parseJson(run)).toMatchObject({
			success: true,
			branch: SOURCE_BRANCH,
			namespace: "local-plan-store",
			selected_key: PLAN_KEY,
			ref_name: planFile,
			byte_count: content.length,
			source: "saved",
			source_file: planFile,
		});
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ cwd: repoRoot, branch: SOURCE_BRANCH }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([]);
	});

	test("load-plan writes the implementation prompt to a file for bounded JSON output", async () => {
		const repoRoot = await makeTempDir();
		const promptFile = join(await makeTempDir(), "implementation-prompt.md");
		const branch = "planned-branches/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const run = runWithFakes(["exec", "load-plan", PLAN_SLUG, "--prompt-file", promptFile, "--format", "json"], [], {
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
			source: "attached",
			implementation_prompt_file: promptFile,
		});
		expect(payload).not.toHaveProperty("attached_plan_content");
		expect(payload).not.toHaveProperty("implementation_prompt");
		const prompt = await readFile(promptFile, "utf8");
		expect(prompt).toContain("# planned-branch implementation");
		expect(prompt).toContain("----- BEGIN ATTACHED PLAN -----\n# Attached Plan");
	});

	test("load-plan can include large JSON fields explicitly", async () => {
		const repoRoot = await makeTempDir();
		const branch = "planned-branches/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const run = runWithFakes(["exec", "load-plan", PLAN_SLUG, "--include-content", "--include-prompt", "--format", "json"], [], {
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
			byte_count: content.length,
			source: "attached",
			attached_plan_content: content,
		});
		expect(String(payload.implementation_prompt)).toContain("# planned-branch implementation");
		expect(String(payload.implementation_prompt)).toContain("----- BEGIN ATTACHED PLAN -----\n# Attached Plan");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ cwd: repoRoot, branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY }]);
	});
});

describe("planned-branch CLI surface pinning", () => {
	const topLevelHelp = [
		"Usage: planned-branch [--version] <command>",
		"",
		"Commands:",
		"  exec    Run hidden deterministic planned-branch operations for agents.",
		"",
		"Options:",
		"  -h, --help       Show this help.",
		"  -V, --version    Show the package version.",
		"",
	].join("\n");

	function jsonFailure(message: string): string {
		return `${JSON.stringify({ success: false, error: { code: "planned_branch_error", message } })}\n`;
	}

	test.each([[[]], [["-h"]], [["--help"]]])("pins top-level help for %j", async (args) => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(args, [], { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(topLevelHelp);
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test("pins -V output", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["-V"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test("rejects inline equals syntax for create flags", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "create", "--slug=branch-scoped-plan"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Error: Unknown option: --slug=branch-scoped-plan\n");
		// PINNED QUIRK (clinkr-migration): planned-branch does not accept --flag=value syntax.
	});

	test("last duplicate --slug wins in create JSON output", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const run = runWithFakes(
			["exec", "create", "--slug", "first-branch-plan", "--slug", PLAN_SLUG, "--plan-file", planFile, "--format", "json"],
			[],
			{ cwd: repoRoot, git: { headCommit: START_POINT } },
		);

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toEqual({
			success: true,
			slug: PLAN_SLUG,
			branch: PLAN_SLUG,
			branch_creation: "plain-git",
			start_point: START_POINT,
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			ref_name: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${PLAN_SLUG}:${PLAN_KEY}`,
			commit: "abc123",
			source_file: planFile,
		});
		// PINNED QUIRK (clinkr-migration): duplicate scalar flags are accepted and the last value wins.
	});

	test("pins invalid branch-creation in human and JSON formats", async () => {
		const repoRoot = await makeTempDir();
		const human = runWithFakes(["exec", "create", "--slug", PLAN_SLUG, "--plan-file", "/tmp/plan.md", "--branch-creation", "bogus"], [], { cwd: repoRoot });
		expect(await human.exit).toBe(2);
		expect(human.stderr.join("")).toBe("Error: --branch-creation must be one of plain-git or graphite.\n");

		const json = runWithFakes(["exec", "create", "--slug", PLAN_SLUG, "--plan-file", "/tmp/plan.md", "--branch-creation", "bogus", "--format", "json"], [], {
			cwd: repoRoot,
		});
		expect(await json.exit).toBe(2);
		expect(json.stdout.join("")).toBe(jsonFailure("--branch-creation must be one of plain-git or graphite."));
	});

	test("create flags are order-independent and success JSON is byte-exact", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "planned-branches/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"create",
				"--format",
				"json",
				"--branch-creation",
				"plain-git",
				"--plan-file",
				planFile,
				"--summary",
				"Create it",
				"--branch",
				branch,
				"--slug",
				PLAN_SLUG,
			],
			[],
			{ cwd: repoRoot, git: { headCommit: START_POINT } },
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			`${JSON.stringify({
				success: true,
				slug: PLAN_SLUG,
				branch,
				branch_creation: "plain-git",
				start_point: START_POINT,
				namespace: PLAN_BRANCH_NAMESPACE,
				key: PLAN_KEY,
				ref_name: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${branch.replaceAll("/", "---")}:${PLAN_KEY}`,
				commit: "abc123",
				source_file: planFile,
				summary: "Create it",
			})}\n`,
		);
	});

	test("pins load-plan positional placement and duplicate positional error", async () => {
		const repoRoot = await makeTempDir();
		const branch = "planned-branches/branch-scoped-plan";
		const content = "# Attached Plan\n";
		const placedAfterFlag = runWithFakes(["exec", "load-plan", "--format", "json", PLAN_SLUG], [], {
			cwd: repoRoot,
			git: { implementationBranch: branch, defaultBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});
		expect(await placedAfterFlag.exit).toBe(0);
		expect(parseJson(placedAfterFlag)).toEqual({
			success: true,
			branch,
			namespace: PLAN_BRANCH_NAMESPACE,
			selected_key: PLAN_KEY,
			ref_name: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${branch.replaceAll("/", "---")}:${PLAN_KEY}`,
			byte_count: content.length,
			available_keys: [PLAN_KEY],
			source: "attached",
		});

		const duplicate = runWithFakes(["exec", "load-plan", PLAN_SLUG, "other-plan", "--format", "json"], [], { cwd: repoRoot });
		expect(await duplicate.exit).toBe(2);
		expect(duplicate.stdout.join("")).toBe(jsonFailure("load-plan accepts at most one key or slug."));
	});
});

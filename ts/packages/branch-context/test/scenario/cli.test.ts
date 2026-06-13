import { afterEach, describe, expect, test } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runCli } from "../../src/cli.ts";
import { BRANCH_CONTEXT_NAMESPACE } from "../../src/constants.ts";
import { encodeBranchForPlanPath } from "@asdl/plans";
import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import { InMemoryBranchContextBrmemGateway, type InMemoryBrmemGatewayState } from "../support/in-memory-brmem-gateway.ts";
import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@asdl/core/git/testing";
import { createTempDirTracker } from "@asdl/core/testing";
import { InMemoryBranchContextGraphiteGateway, type InMemoryGraphiteGatewayState } from "../support/in-memory-graphite-gateway.ts";

const SOURCE_BRANCH = "feature/source-plan";
const PLAN_SLUG = "branch-scoped-plan";
const PLAN_KEY = "plan.md";
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const PLAN_STORE_REPO_KEY = "gh--owner--repo";

const TOP_LEVEL_HELP = [
	"Usage: branch-context [options] [command]",
	"",
	"Branch context operations.",
	"",
	"Options:",
	"  -V, --version  Show the package version.",
	"  --runtime      Show CLI runtime diagnostics and exit.",
	"  -h, --help     display help for command",
	"",
].join("\n");
// PINNED CLINKR SEMANTICS: the hidden exec subgroup is omitted from top-level help.

const EXEC_HELP = [
	"Usage: branch-context exec [options] [command]",
	"",
	"Run hidden deterministic branch-context operations for agents.",
	"",
	"Options:",
	"  -h, --help              display help for command",
	"",
	"Commands:",
	"  from-plan [options]     Create a branch context from a saved plan.",
	"  load [options] [key]    Load a branch-context entry and render the",
	"                          implementation prompt.",
	"  attach [options] [key]  Attach a saved plan or file as branch context.",
	"  list [options]          List branch-context entries.",
	"  check [options] [key]   Check whether a branch-context entry exists.",
	"  delete [options] [key]  Delete a branch-context entry.",
	"",
].join("\n");

const CREATE_HELP = [
	"Usage: branch-context exec from-plan [options]",
	"",
	"Create a branch context from a saved plan.",
	"",
	"Options:",
	"  --slug <value>             Branch context slug.",
	"  --plan-file <value>        Plan file path (must live outside the repository).",
	"  --branch <value>           Branch name (defaults to the slug).",
	'  --branch-creation <value>  Branch creation method. (default: "plain-git")',
	'                             (choices: "plain-git", "graphite")',
	"  --summary <value>          Optional plan summary.",
	'  --format <format>          Output format. (choices: "human", "json", default:',
	'                             "human")',
	"  --json-schema              Print the JSON Schema for this command's",
	"                             input/output and exit.",
	"  -h, --help                 display help for command",
	"",
].join("\n");

const LOAD_PLAN_HELP = [
	"Usage: branch-context exec load [options] [key]",
	"",
	"Load a branch-context entry and render the implementation prompt.",
	"",
	"Arguments:",
	"  key                    Branch-context key (defaults to plan.md).",
	"",
	"Options:",
	"  --prompt-file <value>  Write the implementation prompt to this file.",
	"  --include-content      Include the branch-context entry content in JSON",
	"                         output.",
	"  --include-prompt       Include the implementation prompt in JSON output.",
	'  --format <format>      Output format. (choices: "human", "json", default:',
	'                         "human")',
	"  --json-schema          Print the JSON Schema for this command's input/output",
	"                         and exit.",
	"  -h, --help             display help for command",
	"",
].join("\n");

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

class FakeCommands implements CommandExecApi {
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
	git: InMemoryGitGateway;
	brmem: InMemoryBranchContextBrmemGateway;
	graphite: InMemoryBranchContextGraphiteGateway;
}

interface RunWithFakesOptions {
	cwd: string;
	planStoreRoot?: string;
	git?: InMemoryGitGatewayState;
	brmem?: InMemoryBrmemGatewayState;
	graphite?: InMemoryGraphiteGatewayState;
}

const tempDirs = createTempDirTracker();

afterEach(async () => {
	await tempDirs.cleanup();
});

async function makeTempDir(prefix = "branch-context-cli-"): Promise<string> {
	return tempDirs.makeTempDir(prefix);
}

async function writeSavedPlan(
	planStoreRoot: string,
	params: { slug?: string | undefined; branch?: string | undefined; content?: string | undefined } = {},
): Promise<string> {
	const slug = params.slug ?? PLAN_SLUG;
	const branch = params.branch ?? SOURCE_BRANCH;
	const planDirectory = join(planStoreRoot, PLAN_STORE_REPO_KEY, encodeBranchForPlanPath(branch));
	await mkdir(planDirectory, { recursive: true });
	const filePath = join(planDirectory, `${slug}.md`);
	await writeFile(filePath, params.content ?? "# Saved Plan\n", "utf8");
	return filePath;
}

function runWithFakes(args: readonly string[], script: readonly ScriptedExec[] = [], options: RunWithFakesOptions): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const commands = new FakeCommands(script);
	const git = new InMemoryGitGateway({
		repoRoot: options.cwd,
		optionalRepoRoot: options.cwd,
		currentBranch: SOURCE_BRANCH,
		...(options.git ?? {}),
	});
	const brmem = new InMemoryBranchContextBrmemGateway(options.brmem);
	const graphite = new InMemoryBranchContextGraphiteGateway(options.graphite);
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

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function jsonFailure(message: string): string {
	return `${JSON.stringify({ success: false, error: { code: "branch_context_error", message } })}\n`;
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
	expect(run.git.currentBranchCalls).toEqual([]);
	expect(run.git.trunkBranchCalls).toEqual([]);
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

describe("branch-context CLI help, version, and dispatch pins", () => {
	test.each([[[]], [["-h"]], [["--help"]]])("pins top-level help for %j", async (args) => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(args, [], { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(TOP_LEVEL_HELP);
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test.each([[["-V"]], [["--version"]]])("pins version output for %j", async (args) => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(args, [], { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test("pins --runtime output", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["--runtime"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			"runtime: typescript\nentry_point: @asdl/branch-context bin branch-context -> ts/packages/branch-context/src/cli.ts\n",
		);
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test.each([
		[["exec"], EXEC_HELP],
		[["exec", "--help"], EXEC_HELP],
		[["exec", "-h"], EXEC_HELP],
		[["exec", "from-plan", "--help"], CREATE_HELP],
		[["exec", "from-plan", "-h"], CREATE_HELP],
		[["exec", "load", "--help"], LOAD_PLAN_HELP],
		[["exec", "load", "-h"], LOAD_PLAN_HELP],
	])("prints exact help for %j", async (args, help) => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(args, [], { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(help);
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test("pins unknown command and unknown exec operation stderr", async () => {
		const repoRoot = await makeTempDir();
		const unknown = runWithFakes(["bogus"], [], { cwd: repoRoot });
		expect(await unknown.exit).toBe(2);
		expect(unknown.stdout.join("")).toBe("");
		expect(unknown.stderr.join("")).toBe("error: unknown command 'bogus'\n");

		const unknownExec = runWithFakes(["exec", "bogus"], [], { cwd: repoRoot });
		expect(await unknownExec.exit).toBe(2);
		expect(unknownExec.stderr.join("")).toBe("error: unknown command 'bogus'\n");

		const unknownExecJson = runWithFakes(["exec", "bogus", "--format", "json"], [], { cwd: repoRoot });
		expect(await unknownExecJson.exit).toBe(2);
		expect(unknownExecJson.stdout.join("")).toBe("");
		expect(unknownExecJson.stderr.join("")).toBe("error: unknown command 'bogus'\n");
		// PINNED CLINKR SEMANTICS: unknown exec operations bypass --format json.
	});
});

describe("branch-context CLI parse failures", () => {
	test("reports missing flag values as raw stderr without running commands", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "from-plan", "--slug"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: option '--slug <value>' argument missing\n");
		expect(run.commands.execCalls).toEqual([]);
	});

	test("missing flag value before --format json consumes the next flag", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "from-plan", "--slug", "--format", "json"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: too many arguments for 'from-plan'. Expected 0 arguments but got 1.\n");
		expect(run.commands.execCalls).toEqual([]);
		// PINNED QUIRK (clinkr-migration): commander consumes "--format" as the --slug
		// value, leaving "json" as an excess positional; usage errors stay raw stderr.
	});

	test("reports missing required options as zod usage errors", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "from-plan"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe(
			[
				"error: --slug: Invalid input: expected string, received undefined",
				"error: --plan-file: Invalid input: expected string, received undefined",
				"",
			].join("\n"),
		);
		expect(run.commands.execCalls).toEqual([]);
	});

	test("reports unknown options as raw stderr in human and JSON modes", async () => {
		const repoRoot = await makeTempDir();
		const human = runWithFakes(["exec", "load", "--bogus"], [], { cwd: repoRoot });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe("error: unknown option '--bogus'\n");
		expect(human.commands.execCalls).toEqual([]);

		const json = runWithFakes(["exec", "load", "--format", "json", "--bogus"], [], { cwd: repoRoot });
		expect(await json.exit).toBe(2);
		expect(json.stdout.join("")).toBe("");
		expect(json.stderr.join("")).toBe("error: unknown option '--bogus'\n");
		expect(json.commands.execCalls).toEqual([]);
		// PINNED CLINKR SEMANTICS: usage errors are raw stderr, never JSON-enveloped.
	});

	test("pins invalid branch context slug failures in human and JSON modes", async () => {
		const repoRoot = await makeTempDir();
		const message = "Invalid branch context slug: Slug must be lowercase kebab-case using only a-z, 0-9, and single hyphens.";
		const human = runWithFakes(["exec", "from-plan", "--slug", "Not-Kebab-Case", "--plan-file", "/tmp/plan.md"], [], { cwd: repoRoot });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe(`error: ${message}\n`);

		const json = runWithFakes(["exec", "from-plan", "--slug", "Not-Kebab-Case", "--plan-file", "/tmp/plan.md", "--format", "json"], [], { cwd: repoRoot });
		expect(await json.exit).toBe(2);
		expect(json.stdout.join("")).toBe(jsonFailure(message));
		expect(json.stderr.join("")).toBe("");
	});
});

describe("branch-context exec", () => {
	test("create makes a plain git branch and attaches the plan in the branch-context namespace", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			["exec", "from-plan", "--slug", PLAN_SLUG, "--plan-file", planFile, "--branch", branch, "--summary", "Create it", "--format", "json"],
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
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: PLAN_KEY,
			source_file: planFile,
			summary: "Create it",
		});
		expect(run.brmem.attachmentPresenceCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY }]);
		expect(run.brmem.attachPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY, sourceFile: planFile }]);
		expect(run.graphite.checkBranchTrackedCalls).toEqual([]);
		expect(run.graphite.trackBranchCalls).toEqual([]);
		expect(run.brmem.attachedPlans).toContainEqual({
			branch,
			key: PLAN_KEY,
			content: "",
			refName: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: planFile,
		});
	});

	test("create tracks Graphite branches through the semantic gateway", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
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
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: PLAN_KEY,
			source_file: planFile,
		});
		expect(run.graphite.checkBranchTrackedCalls).toEqual([{ cwd: repoRoot, branch: SOURCE_BRANCH }]);
		expect(run.graphite.trackBranchCalls).toEqual([{ cwd: repoRoot, branch, parentBranch: SOURCE_BRANCH }]);
		expect(run.brmem.attachPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY, sourceFile: planFile }]);
	});

	test("untracked Graphite parents fail before creating a branch or attaching Branch Memory", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
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
				graphite: {
					untrackedBranches: [SOURCE_BRANCH],
					untrackedDetail: `ERROR: Cannot perform this operation on untracked branch ${SOURCE_BRANCH}.`,
				},
			},
		);

		expect(await run.exit).toBe(2);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload.success).toBe(false);
		const message = String((payload.error as { message: string }).message);
		expect(message).toContain("Current branch is not tracked by Graphite; refusing to stack a branch context on it.");
		expect(message).toContain(`Parent branch: ${SOURCE_BRANCH}`);
		expect(message).toContain("No branch was created and no plan was attached.");
		expect(message).toContain("ERROR: Cannot perform this operation on untracked branch");
		expect(run.git.existingBranches).not.toContain(branch);
		expect(run.git.createBranchAtHeadCalls).toEqual([]);
		expect(run.graphite.checkBranchTrackedCalls).toEqual([{ cwd: repoRoot, branch: SOURCE_BRANCH }]);
		expect(run.graphite.trackBranchCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("Graphite tracking failures keep the local branch and skip Branch Memory attach", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
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
		expect(run.graphite.checkBranchTrackedCalls).toEqual([{ cwd: repoRoot, branch: SOURCE_BRANCH }]);
		expect(run.graphite.trackBranchCalls).toEqual([{ cwd: repoRoot, branch, parentBranch: SOURCE_BRANCH }]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("load JSON is metadata-only by default", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const run = runWithFakes(["exec", "load", "--format", "json"], [], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			success: true,
			branch,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			selected_key: PLAN_KEY,
			byte_count: content.length,
			source: "attached",
		});
		expect(payload).not.toHaveProperty("attached_plan_content");
		expect(payload).not.toHaveProperty("implementation_prompt");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ cwd: repoRoot, branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY }]);
	});

	test("load falls back to the latest saved source-branch plan when no plan is attached", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planDirectory = join(planStoreRoot, "gh--owner--repo", encodeBranchForPlanPath(SOURCE_BRANCH));
		await mkdir(planDirectory, { recursive: true });
		const planFile = join(planDirectory, PLAN_KEY);
		const content = "# Saved Plan\n\n- Implement directly from the saved plan.\n";
		await writeFile(planFile, content, "utf8");
		const run = runWithFakes(["exec", "load", "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
			git: { currentBranch: SOURCE_BRANCH, trunkBranch: "main" },
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

	test("load writes the implementation prompt to a file for bounded JSON output", async () => {
		const repoRoot = await makeTempDir();
		const promptFile = join(await makeTempDir(), "implementation-prompt.md");
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const run = runWithFakes(["exec", "load", "--prompt-file", promptFile, "--format", "json"], [], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			success: true,
			branch,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			selected_key: PLAN_KEY,
			source: "attached",
			implementation_prompt_file: promptFile,
		});
		expect(payload).not.toHaveProperty("attached_plan_content");
		expect(payload).not.toHaveProperty("implementation_prompt");
		const prompt = await readFile(promptFile, "utf8");
		expect(prompt).toContain("# branch-context implementation");
		expect(prompt).toContain("----- BEGIN ATTACHED PLAN -----\n# Attached Plan");
	});

	test("load can include large JSON fields explicitly", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const run = runWithFakes(["exec", "load", "--include-content", "--include-prompt", "--format", "json"], [], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			success: true,
			branch,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			selected_key: PLAN_KEY,
			byte_count: content.length,
			source: "attached",
			attached_plan_content: content,
		});
		expect(String(payload.implementation_prompt)).toContain("# branch-context implementation");
		expect(String(payload.implementation_prompt)).toContain("----- BEGIN ATTACHED PLAN -----\n# Attached Plan");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ cwd: repoRoot, branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY }]);
	});

	test("load accepts JSON-only include flags in human mode without changing output", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const fakes = {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		};
		const withFlags = runWithFakes(["exec", "load", "--include-content", "--include-prompt"], [], fakes);
		expect(await withFlags.exit).toBe(0);
		expect(withFlags.stderr.join("")).toBe("");
		expect(withFlags.stdout.join("")).toContain(`Selected key: ${PLAN_KEY}`);
		expect(withFlags.stdout.join("")).toContain("----- BEGIN ATTACHED PLAN -----\n# Attached Plan");

		const withoutFlags = runWithFakes(["exec", "load"], [], fakes);
		expect(await withoutFlags.exit).toBe(0);
		expect(withoutFlags.stdout.join("")).toBe(withFlags.stdout.join(""));
		// PINNED CLINKR SEMANTICS (behavior change): --include-content/--include-prompt
		// no longer require --format json; they are accepted and ignored in human mode.
	});

	test("attach stores an arbitrary file under an exact key", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const sourceFile = join(outsideDir, "notes.md");
		await writeFile(sourceFile, "# Notes\n", "utf8");
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "attach", "notes", "--file", sourceFile, "--format", "json"], [], {
			cwd: repoRoot,
			git: { currentBranch: branch },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({ success: true, branch, namespace: BRANCH_CONTEXT_NAMESPACE, key: "notes", source_file: sourceFile });
		expect(run.brmem.attachPlanCalls).toEqual([{ cwd: repoRoot, branch, key: "notes", sourceFile }]);
	});

	test("attach --plan stores a saved plan as plan.md and reports the plan slug", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const sourceFile = await writeSavedPlan(planStoreRoot);
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "attach", "--plan", PLAN_SLUG, "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
			git: { repoRoot, currentBranch: branch },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			success: true,
			branch,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: PLAN_KEY,
			source_file: sourceFile,
			plan_slug: PLAN_SLUG,
		});
		expect(run.brmem.attachmentPresenceCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY }]);
		expect(run.brmem.attachPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY, sourceFile }]);
	});

	test("attach --plan rejects key and file arguments", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const sourceFile = join(outsideDir, "notes.md");
		await writeFile(sourceFile, "# Notes\n", "utf8");
		const message = "Pass either --plan <slug> or <key> --file <path>, not both.";
		const run = runWithFakes(["exec", "attach", "notes", "--file", sourceFile, "--plan", PLAN_SLUG, "--format", "json"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(jsonFailure(message));
		expect(run.stderr.join("")).toBe("");
		expect(run.brmem.attachmentPresenceCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("attach --plan reports missing slugs with available slugs", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		await writeSavedPlan(planStoreRoot, { slug: "available-plan" });
		const run = runWithFakes(["exec", "attach", "--plan", "missing-plan", "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
			git: { repoRoot },
		});

		expect(await run.exit).toBe(2);
		const payload = parseJson(run);
		expect(payload.success).toBe(false);
		const message = String((payload.error as { message: string }).message);
		expect(message).toContain("No saved plan found for slug `missing-plan`.");
		expect(message).toContain("Available slugs:");
		expect(message).toContain("- available-plan");
		expect(run.brmem.attachmentPresenceCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("attach --plan reports duplicate slug matches", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const first = await writeSavedPlan(planStoreRoot, { branch: "feature/one" });
		const second = await writeSavedPlan(planStoreRoot, { branch: "feature/two" });
		const run = runWithFakes(["exec", "attach", "--plan", PLAN_SLUG, "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
			git: { repoRoot },
		});

		expect(await run.exit).toBe(2);
		const payload = parseJson(run);
		expect(payload.success).toBe(false);
		const message = String((payload.error as { message: string }).message);
		expect(message).toContain(`Multiple saved plans found for slug \`${PLAN_SLUG}\`; choose a file explicitly.`);
		expect(message).toContain(first);
		expect(message).toContain(second);
		expect(run.brmem.attachmentPresenceCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("attach reports missing source arguments", async () => {
		const repoRoot = await makeTempDir();
		const message = "Attach requires either --plan <slug> or <key> --file <path>.";
		const run = runWithFakes(["exec", "attach", "--format", "json"], [], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(jsonFailure(message));
		expect(run.stderr.join("")).toBe("");
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("attach --plan honors --branch without requiring a current branch", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const sourceFile = await writeSavedPlan(planStoreRoot);
		const branch = "branch-contexts/override";
		const run = runWithFakes(["exec", "attach", "--plan", PLAN_SLUG, "--branch", branch, "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
			git: { repoRoot, currentBranch: { type: "detached" } },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({ success: true, branch, key: PLAN_KEY, source_file: sourceFile, plan_slug: PLAN_SLUG });
		expect(run.git.currentBranchCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_KEY, sourceFile }]);
	});

	test("attach --plan fails on detached HEAD without --branch", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		await writeSavedPlan(planStoreRoot);
		const run = runWithFakes(["exec", "attach", "--plan", PLAN_SLUG, "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
			git: { repoRoot, currentBranch: { type: "detached" } },
		});

		expect(await run.exit).toBe(2);
		const payload = parseJson(run);
		expect(payload.success).toBe(false);
		expect(String((payload.error as { message: string }).message)).toContain("Cannot default branch-context operation from detached HEAD. Pass --branch explicitly.");
		expect(run.brmem.attachmentPresenceCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("list flags the canonical plan entry", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "list"], [], {
			cwd: repoRoot,
			git: { currentBranch: branch },
			brmem: { entries: [{ branch, key: PLAN_KEY }, { branch, key: "notes" }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("- plan.md (plan)");
		expect(run.stdout.join("")).toContain("- notes");
	});

	test("check exits successfully for absent entries", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "check", "missing", "--format", "json"], [], { cwd: repoRoot, git: { currentBranch: branch } });

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({ success: true, branch, namespace: BRANCH_CONTEXT_NAMESPACE, key: "missing", present: false });
	});

	test("delete removes an explicit branch-context key", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "delete", "notes", "--format", "json"], [], {
			cwd: repoRoot,
			git: { currentBranch: branch },
			brmem: { entries: [{ branch, key: "notes" }] },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({ success: true, branch, namespace: BRANCH_CONTEXT_NAMESPACE, key: "notes", deleted: true });
		expect(run.brmem.deleteEntryCalls).toEqual([{ cwd: repoRoot, branch, key: "notes" }]);
	});
});

describe("branch-context CLI surface pinning", () => {
	test("accepts inline equals syntax for create flags", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const run = runWithFakes(["exec", "from-plan", `--slug=${PLAN_SLUG}`, `--plan-file=${planFile}`, "--format=json"], [], {
			cwd: repoRoot,
			git: { headCommit: START_POINT },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({ success: true, slug: PLAN_SLUG, branch: PLAN_SLUG, source_file: planFile });
		// PINNED CLINKR SEMANTICS: commander accepts --flag=value syntax.
	});

	test("last duplicate --slug wins in create JSON output", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const run = runWithFakes(
			["exec", "from-plan", "--slug", "first-branch-plan", "--slug", PLAN_SLUG, "--plan-file", planFile, "--format", "json"],
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
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: PLAN_KEY,
			ref_name: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${PLAN_SLUG}:${PLAN_KEY}`,
			commit: "abc123",
			source_file: planFile,
		});
		// PINNED QUIRK (clinkr-migration): duplicate scalar flags are accepted and the last value wins.
	});

	test("pins invalid branch-creation as a raw commander choices error in human and JSON modes", async () => {
		const repoRoot = await makeTempDir();
		const message = "error: option '--branch-creation <value>' argument 'bogus' is invalid. Allowed choices are plain-git, graphite.\n";
		const human = runWithFakes(["exec", "from-plan", "--slug", PLAN_SLUG, "--plan-file", "/tmp/plan.md", "--branch-creation", "bogus"], [], { cwd: repoRoot });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe(message);

		const json = runWithFakes(["exec", "from-plan", "--slug", PLAN_SLUG, "--plan-file", "/tmp/plan.md", "--branch-creation", "bogus", "--format", "json"], [], {
			cwd: repoRoot,
		});
		expect(await json.exit).toBe(2);
		expect(json.stdout.join("")).toBe("");
		expect(json.stderr.join("")).toBe(message);
		// PINNED CLINKR SEMANTICS: enum choice errors are raw stderr, never JSON-enveloped.
	});

	test("accepts --format human explicitly", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n";
		const run = runWithFakes(["exec", "load", "--format", "human"], [], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.stdout.join("")).toContain(`Selected key: ${PLAN_KEY}`);
		// PINNED CLINKR SEMANTICS: --format human is an accepted choice (was rejected pre-migration).
	});

	test("create flags are order-independent and success JSON is byte-exact", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
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
				namespace: BRANCH_CONTEXT_NAMESPACE,
				key: PLAN_KEY,
				ref_name: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${PLAN_KEY}`,
				commit: "abc123",
				source_file: planFile,
				summary: "Create it",
			})}\n`,
		);
	});

	test("pins load positional placement and duplicate positional error", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n";
		const placedAfterFlag = runWithFakes(["exec", "load", "--format", "json", PLAN_KEY], [], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});
		expect(await placedAfterFlag.exit).toBe(0);
		expect(parseJson(placedAfterFlag)).toEqual({
			success: true,
			branch,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			selected_key: PLAN_KEY,
			ref_name: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${PLAN_KEY}`,
			byte_count: content.length,
			available_keys: [PLAN_KEY],
			source: "attached",
		});

		const duplicate = runWithFakes(["exec", "load", PLAN_KEY, "other-plan", "--format", "json"], [], { cwd: repoRoot });
		expect(await duplicate.exit).toBe(2);
		expect(duplicate.stdout.join("")).toBe("");
		expect(duplicate.stderr.join("")).toBe("error: too many arguments for 'load'. Expected 1 argument but got 2.\n");
		// PINNED CLINKR SEMANTICS: excess positionals are a raw commander usage error, never JSON-enveloped.
	});
});

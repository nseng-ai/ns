import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { definePlan } from "@asdl/ts-plans";
import { TS_PLAN_RECIPE_TRUST_NOTICE } from "@asdl/ts-plans/host";

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
const PLAN_TS_KEY = `${PLAN_SLUG}.plan.ts`;
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const TS_RECIPE_CONTENT = buildTsRecipeContent({
	title: "Preview TS plan",
	summary: "Preview summary",
	goal: "Ship TypeScript previews",
	context: "Existing planned-branch context",
	phases: [
		{
			title: "Inspect CLI",
			prompt: "Use the planned-branch CLI style.",
			tasks: ["Load attached TS plan", "Render preview"],
		},
	],
});

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

function buildTsRecipeContent(input: Parameters<typeof definePlan>[0]): string {
	definePlan(input);
	const serialized = JSON.stringify(input, null, "\t");
	if (serialized === undefined) {
		throw new Error("Could not serialize TS recipe input.");
	}
	return `import { definePlan } from "@asdl/ts-plans";

export default definePlan(${serialized});
`;
}

function parseJson(run: CliRun): Record<string, unknown> {
	return JSON.parse(run.stdout.join("")) as Record<string, unknown>;
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
		expect(help.stdout.join("")).toContain("exec");

		const version = runWithFakes(["--version"], [], { cwd: repoRoot });
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");

		const execHelp = runWithFakes(["exec", "--help"], [], { cwd: repoRoot });
		expect(await execHelp.exit).toBe(0);
		expect(execHelp.stdout.join("")).toContain("write-plan-file");
		expect(execHelp.stdout.join("")).toContain("list-plans");
		expect(execHelp.stdout.join("")).toContain("load-plan");
		expect(execHelp.stdout.join("")).toContain("preview-ts");

		const previewHelp = runWithFakes(["exec", "preview-ts", "--help"], [], { cwd: repoRoot });
		expect(await previewHelp.exit).toBe(0);
		expect(previewHelp.stdout.join("")).toContain("Usage: planned-branch exec preview-ts");
		expect(previewHelp.stdout.join("")).toContain("--preview-format text|mermaid");
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

	test("rejects preview-ts unknown flags and preview formats before git or brmem calls", async () => {
		const repoRoot = await makeTempDir();
		const unknown = runWithFakes(["exec", "preview-ts", "--format", "json", "--bogus"], [], { cwd: repoRoot });

		expect(await unknown.exit).toBe(2);
		expect(parseJson(unknown)).toEqual({
			success: false,
			error: { code: "planned_branch_error", message: "Unknown option: --bogus" },
		});
		expect(unknown.commands.execCalls).toEqual([]);
		expectNoGitOrBrmemCalls(unknown);

		const invalidFormat = runWithFakes(["exec", "preview-ts", "--preview-format", "dot", "--format", "json"], [], { cwd: repoRoot });
		expect(await invalidFormat.exit).toBe(2);
		expect(parseJson(invalidFormat)).toEqual({
			success: false,
			error: { code: "planned_branch_error", message: "--preview-format must be one of text or mermaid." },
		});
		expect(invalidFormat.commands.execCalls).toEqual([]);
		expectNoGitOrBrmemCalls(invalidFormat);
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

	test("list-plans returns saved plans for an explicit source branch", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const sourceBranch = "feature/other-source";
		const planDirectory = join(planStoreRoot, "gh--owner--repo", encodeBranchForPlanPath(sourceBranch));
		const currentBranchDirectory = join(planStoreRoot, "gh--owner--repo", encodeBranchForPlanPath(SOURCE_BRANCH));
		await mkdir(planDirectory, { recursive: true });
		await mkdir(currentBranchDirectory, { recursive: true });
		const markdownPlan = join(planDirectory, PLAN_KEY);
		const tsPlan = join(planDirectory, PLAN_TS_KEY);
		await writeFile(markdownPlan, "# Markdown\n", "utf8");
		await writeFile(tsPlan, TS_RECIPE_CONTENT, "utf8");
		await writeFile(join(planDirectory, "ignore.txt"), "ignore", "utf8");
		await writeFile(join(currentBranchDirectory, "other-branch-plan.md"), "ignore", "utf8");
		await utimes(markdownPlan, new Date(1_000), new Date(1_000));
		await utimes(tsPlan, new Date(2_000), new Date(2_000));

		const run = runWithFakes(["exec", "list-plans", "--source-branch", sourceBranch, "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
		});

		expect(await run.exit).toBe(0);
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			success: true,
			repo_key: "gh--owner--repo",
			source_branch: sourceBranch,
			branch_key: encodeBranchForPlanPath(sourceBranch),
			directory_path: planDirectory,
			count: 2,
		});
		const plans = payload.plans as Array<Record<string, unknown>>;
		expect(plans.map(({ slug, file_name, file_path, kind }) => ({ slug, file_name, file_path, kind }))).toEqual([
			{ slug: PLAN_SLUG, file_name: PLAN_TS_KEY, file_path: tsPlan, kind: "typescript-recipe" },
			{ slug: PLAN_SLUG, file_name: PLAN_KEY, file_path: markdownPlan, kind: "markdown" },
		]);
		expect(run.git.sourceBranchCalls).toEqual([]);
	});

	test("list-plans succeeds with an empty list when the branch has no plan store directory", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const run = runWithFakes(["exec", "list-plans", "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			success: true,
			source_branch: SOURCE_BRANCH,
			branch_key: encodeBranchForPlanPath(SOURCE_BRANCH),
			count: 0,
			plans: [],
		});
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

	test("preview-ts JSON loads attached TS plans and returns metadata plus text preview trust", async () => {
		const repoRoot = await makeTempDir();
		const branch = "planned-branches/branch-scoped-plan";
		const run = runWithFakes(["exec", "preview-ts", "--format", "json"], [], {
			cwd: repoRoot,
			git: { implementationBranch: branch, defaultBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_TS_KEY, content: TS_RECIPE_CONTENT }] },
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			success: true,
			branch,
			namespace: PLAN_BRANCH_NAMESPACE,
			selected_key: PLAN_TS_KEY,
			byte_count: TS_RECIPE_CONTENT.length,
			source: "attached",
			preview_format: "text",
			trust_notice: TS_PLAN_RECIPE_TRUST_NOTICE,
			title: "Preview TS plan",
			summary: "Preview summary",
		});
		expect(String(payload.preview_content)).toContain("# Preview TS plan");
		expect(String(payload.preview_content)).toContain("Goal:\nShip TypeScript previews");
		expect(String(payload.preview_content)).toContain("- Task: Load attached TS plan");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ cwd: repoRoot, branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_TS_KEY }]);
	});

	test("preview-ts normalizes requested TS plan slugs to .plan.ts", async () => {
		const repoRoot = await makeTempDir();
		const branch = "planned-branches/branch-scoped-plan";
		const run = runWithFakes(["exec", "preview-ts", PLAN_SLUG, "--format", "json"], [], {
			cwd: repoRoot,
			git: { implementationBranch: branch, defaultBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_TS_KEY, content: TS_RECIPE_CONTENT }] },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			success: true,
			selected_key: PLAN_TS_KEY,
			preview_format: "text",
		});
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ cwd: repoRoot, branch, key: PLAN_TS_KEY }]);
	});

	test("preview-ts JSON renders Mermaid content with a separate trust notice", async () => {
		const repoRoot = await makeTempDir();
		const branch = "planned-branches/branch-scoped-plan";
		const run = runWithFakes(["exec", "preview-ts", "--preview-format", "mermaid", "--format", "json"], [], {
			cwd: repoRoot,
			git: { implementationBranch: branch, defaultBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_TS_KEY, content: TS_RECIPE_CONTENT }] },
		});

		expect(await run.exit).toBe(0);
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			success: true,
			selected_key: PLAN_TS_KEY,
			preview_format: "mermaid",
			trust_notice: TS_PLAN_RECIPE_TRUST_NOTICE,
		});
		expect(String(payload.preview_content).startsWith("flowchart TD")).toBe(true);
		expect(String(payload.preview_content)).toContain("Preview TS plan");
		expect(String(payload.preview_content)).not.toContain("Trust boundary");
	});

	test("preview-ts falls back to latest saved TS plan when no TS plan is attached", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const branch = "planned-branches/branch-scoped-plan";
		const planDirectory = join(planStoreRoot, "gh--owner--repo", encodeBranchForPlanPath(SOURCE_BRANCH));
		await mkdir(planDirectory, { recursive: true });
		const planFile = join(planDirectory, PLAN_TS_KEY);
		await writeFile(planFile, TS_RECIPE_CONTENT, "utf8");

		const run = runWithFakes(["exec", "preview-ts", "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
			git: { implementationBranch: branch, defaultBranch: "main" },
		});

		expect(await run.exit).toBe(0);
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			success: true,
			branch,
			namespace: "local-plan-store",
			selected_key: PLAN_TS_KEY,
			ref_name: planFile,
			byte_count: TS_RECIPE_CONTENT.length,
			source: "saved",
			source_file: planFile,
			preview_format: "text",
		});
		expect(String(payload.preview_content)).toContain("Goal:\nShip TypeScript previews");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ cwd: repoRoot, branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([]);
	});

	test("preview-ts requested missing attached key does not fall back to saved TS plans", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const branch = "planned-branches/branch-scoped-plan";
		const planDirectory = join(planStoreRoot, "gh--owner--repo", encodeBranchForPlanPath(SOURCE_BRANCH));
		await mkdir(planDirectory, { recursive: true });
		await writeFile(join(planDirectory, PLAN_TS_KEY), TS_RECIPE_CONTENT, "utf8");
		const run = runWithFakes(["exec", "preview-ts", PLAN_SLUG, "--format", "json"], [], {
			cwd: repoRoot,
			planStoreRoot,
			git: { implementationBranch: branch, defaultBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content: "# Markdown only\n" }] },
		});

		expect(await run.exit).toBe(2);
		const payload = parseJson(run);
		expect(payload.success).toBe(false);
		expect(String((payload.error as { message: string }).message)).toContain(`Requested attached plan key \`${PLAN_TS_KEY}\` was not found`);
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ cwd: repoRoot, branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([]);
		expect(run.git.sourceBranchCalls).toEqual([]);
	});
});

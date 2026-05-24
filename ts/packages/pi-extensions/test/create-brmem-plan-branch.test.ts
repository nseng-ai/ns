import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import createBrmemPlanBranchExtension, {
	PLAN_BRANCH_NAMESPACE,
	buildCreateBrmemPlanBranchPrompt,
	formatPlanBranchEvidence,
	isPathInside,
	validatePlanSlug,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
	type ToolDefinition,
} from "../src/create-brmem-plan-branch.ts";
import type { ExecOptions } from "../src/brmem-plans/plan-persistence.ts";

const ROOT = "/repo";
const PLAN_SLUG = "branch-scoped-plan-extension";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const TARGET_BRANCH = "brmem-plans/wire-create-plan-branch-command";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

type ExecCall = {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
};

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

type Notification = {
	message: string;
	level: string | undefined;
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly execCalls: ExecCall[] = [];
	readonly sentUserMessages: string[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];
	private readonly events: string[] | undefined;

	constructor(script: ScriptedExec[] = [], events?: string[]) {
		this.script = [...script];
		this.events = events;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
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

	sendUserMessage(content: string): void {
		this.events?.push("send");
		this.sentUserMessages.push(content);
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
	return step("brmem", ["check", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

function gitBranchStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["branch", branch, "HEAD"], result);
}

function brmemPutStep(branch: string, key: string, filePath: string, result: Partial<ExecResult>): ScriptedExec {
	return step(
		"brmem",
		["put", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--file", filePath, "--format", "json"],
		result,
	);
}

async function makeTempDir(prefix = "create-brmem-plan-branch-"): Promise<string> {
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

function putEnvelope(input: { branch: string; key: string; filePath: string; commit?: string; refName?: string }): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: PLAN_BRANCH_NAMESPACE,
			key: input.key,
			branch: input.branch,
			ref_name: input.refName ?? `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
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

function createContext(events: string[] = []): { ctx: CommandContext; notifications: Notification[]; waits: () => number } {
	const notifications: Notification[] = [];
	let waitCount = 0;
	const ctx: CommandContext = {
		cwd: ROOT,
		hasUI: true,
		ui: {
			notify(message, level): void {
				events.push("notify");
				notifications.push({ message, level });
			},
			setStatus(): void {},
		},
		async waitForIdle(): Promise<void> {
			events.push("wait");
			waitCount += 1;
		},
	};
	return { ctx, notifications, waits: () => waitCount };
}

function registeredTool(pi: FakePi): ToolDefinition {
	const tool = pi.tools.get("create_brmem_plan_branch_from_file");
	expect(tool).toBeDefined();
	if (!tool) {
		throw new Error("create_brmem_plan_branch_from_file was not registered");
	}
	return tool;
}

async function executePlanBranchTool(params: unknown, script: ScriptedExec[], cwd: string = ROOT): Promise<{
	pi: FakePi;
	result: Awaited<ReturnType<ToolDefinition["execute"]>>;
}> {
	const pi = new FakePi(script);
	createBrmemPlanBranchExtension(pi);
	const tool = registeredTool(pi);
	const result = await tool.execute("tool-call", params, undefined, undefined, { cwd });
	return { pi, result };
}

describe("validatePlanSlug", () => {
	test("accepts specific 3-7 word kebab slugs", () => {
		for (const slug of [
			"branch-scoped-plan-extension",
			"brmem-backed-plan-command",
			"semantic-plan-persistence-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeUndefined();
		}
	});

	test("rejects invalid slug shapes", () => {
		for (const slug of [
			"",
			"Branch-Scoped-Plan",
			"branch scoped plan",
			"branch-scoped-plan.md",
			"brmem-plan",
			"one-two-three-four-five-six-seven-eight",
			"implementation-plan-task",
			"branch-2026-plan-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeDefined();
		}
	});
});

describe("buildCreateBrmemPlanBranchPrompt", () => {
	test("includes steering and plan-branch instructions", () => {
		const prompt = buildCreateBrmemPlanBranchPrompt("look at docs/pi/core-subagent-mvp-spec.md");

		expect(prompt).toContain("/create-brmem-plan-branch request");
		expect(prompt).toContain("look at docs/pi/core-subagent-mvp-spec.md");
		expect(prompt).toContain("Inspect the repository and documentation");
		expect(prompt).toContain("temporary Markdown file outside the repository");
		expect(prompt).toContain("Read or otherwise inspect the completed temp file");
		expect(prompt).toContain("Choose a semantic slug from the final plan content");
		expect(prompt).toContain("Optionally choose and pass an explicit target branch name");
		expect(prompt).toContain("call create_brmem_plan_branch_from_file with");
		expect(prompt).toContain(`Branch Memory namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(prompt).toContain("Entry key: <semantic-slug>.md");
		expect(prompt).toContain("Branch target: a plain Git branch created for implementation");
		expect(prompt).toContain("no checked-in plan file");
	});

	test("renders empty steering as none", () => {
		expect(buildCreateBrmemPlanBranchPrompt("   ")).toContain("User steering for this planning request: (none)");
	});
});

describe("formatPlanBranchEvidence", () => {
	test("reports all created branch and Branch Memory evidence", () => {
		const text = formatPlanBranchEvidence({
			slug: PLAN_SLUG,
			branch: TARGET_BRANCH,
			startPoint: START_POINT,
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/brmem-plans---wire-create-plan-branch-command:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: "/tmp/plan.md",
			summary: "Plan the branch-creating flow.",
		});

		expect(text).toContain("Created Branch Memory plan branch.");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain(`Start point: ${START_POINT}`);
		expect(text).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(text).toContain(`Key: ${PLAN_KEY}`);
		expect(text).toContain("Ref: refs/brmem/ns/brmem-plans/brmem-plans---wire-create-plan-branch-command");
		expect(text).toContain("Commit: abc123");
		expect(text).toContain("Source file: /tmp/plan.md");
		expect(text).toContain("Summary: Plan the branch-creating flow.");
	});
});

describe("isPathInside", () => {
	test("handles sibling prefixes correctly", () => {
		expect(isPathInside("/repo", "/repo/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo/nested/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo-other/file.md")).toBe(false);
		expect(isPathInside("/repo", "/repo2/file.md")).toBe(false);
	});
});

describe("create-brmem-plan-branch command", () => {
	test("registers only the new command and tool names", () => {
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi);

		expect(pi.commands.has("create-brmem-plan-branch")).toBe(true);
		expect(pi.tools.has("create_brmem_plan_branch_from_file")).toBe(true);
		expect(pi.commands.has("create-brmem-plan")).toBe(false);
		expect(pi.tools.has("persist_brmem_plan")).toBe(false);
	});

	test("waits for idle before dispatching the generated prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("create-brmem-plan-branch");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("  add a Pi command that creates plan branches in brmem  ", context.ctx);

		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("add a Pi command that creates plan branches in brmem");
		expect(pi.sentUserMessages[0]).toContain("create_brmem_plan_branch_from_file");
		expect(context.notifications).toEqual([
			{ message: "Starting brmem plan-branch planning turn…", level: "info" },
		]);
	});

	test("empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("create-brmem-plan-branch");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});
});

describe("create_brmem_plan_branch_from_file tool", () => {
	test("describes the canonical storage contract and parameters", () => {
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi);
		const tool = registeredTool(pi);
		const parameters = tool.parameters as {
			properties?: Record<string, unknown>;
			required?: string[];
			additionalProperties?: boolean;
		};

		expect(tool.description).toContain("plain Git implementation branch");
		expect(tool.description).toContain("namespace `brmem-plans`");
		expect(tool.description).toContain("key `<slug>.md`");
		expect(tool.promptSnippet).toContain("Branch Memory namespace `brmem-plans`");
		expect(tool.promptGuidelines?.join("\n")).toContain("/create-brmem-plan-branch");
		expect(parameters.required).toEqual(["slug", "filePath"]);
		expect(parameters.additionalProperties).toBe(false);
		expect(Object.keys(parameters.properties ?? {})).toEqual(["slug", "filePath", "branchName", "summary"]);
	});

	test("rejects invalid slug before running commands", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi);
		const tool = registeredTool(pi);

		await expect(
			tool.execute("tool-call", { slug: "Branch Scoped Plan", filePath }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("Invalid Branch Memory plan slug");
		expect(pi.execCalls).toEqual([]);
	});

	test("calls the branch-creating core and reports structured evidence", async () => {
		const filePath = await makePlanFile();
		const { pi, result } = await executePlanBranchTool(
			{
				slug: PLAN_SLUG,
				filePath,
				branchName: TARGET_BRANCH,
				summary: "Plan the brmem-backed branch command.",
			},
			successScript({ branch: TARGET_BRANCH, key: PLAN_KEY, filePath }),
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["check-ref-format", "--branch", TARGET_BRANCH] },
			{ command: "git", args: ["rev-parse", "HEAD"] },
			{ command: "git", args: ["rev-parse", "--verify", `refs/heads/${TARGET_BRANCH}`] },
			{
				command: "brmem",
				args: ["check", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", TARGET_BRANCH, "--format", "json"],
			},
			{ command: "git", args: ["branch", TARGET_BRANCH, "HEAD"] },
			{
				command: "brmem",
				args: ["put", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", TARGET_BRANCH, "--file", filePath, "--format", "json"],
			},
		]);
		expect(result.content[0]?.text).toContain("Created Branch Memory plan branch.");
		expect(result.content[0]?.text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(result.content[0]?.text).toContain(`Start point: ${START_POINT}`);
		expect(result.content[0]?.text).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(result.content[0]?.text).toContain(`Key: ${PLAN_KEY}`);
		expect(result.content[0]?.text).toContain(`Ref: refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/brmem-plans---wire-create-plan-branch-command:${PLAN_KEY}`);
		expect(result.content[0]?.text).toContain("Commit: abc123");
		expect(result.content[0]?.text).toContain(`Source file: ${filePath}`);
		expect(result.content[0]?.text).toContain("Summary: Plan the brmem-backed branch command.");
		expect(result.details).toEqual({
			slug: PLAN_SLUG,
			branch: TARGET_BRANCH,
			startPoint: START_POINT,
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/brmem-plans---wire-create-plan-branch-command:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: filePath,
			summary: "Plan the brmem-backed branch command.",
		});
	});

	test("surfaces partial failure errors from the core", async () => {
		const filePath = await makePlanFile();
		await expect(
			executePlanBranchTool(
				{ slug: PLAN_SLUG, filePath },
				[
					gitRootStep(),
					refFormatStep(PLAN_SLUG),
					headStep(),
					localBranchCheckStep(PLAN_SLUG, { code: 1 }),
					brmemCheckStep(PLAN_SLUG, PLAN_KEY, { code: 1 }),
					gitBranchStep(PLAN_SLUG),
					brmemPutStep(PLAN_SLUG, PLAN_KEY, filePath, { code: 2, stderr: "write failed" }),
				],
			),
		).rejects.toThrow(/Partial failure:[\s\S]*Created branch/);
	});
});

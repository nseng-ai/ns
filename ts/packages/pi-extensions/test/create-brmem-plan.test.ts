import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import createBrmemPlanExtension, {
	buildCreateBrmemPlanPrompt,
	isPathInside,
	validatePlanSlug,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
	type ToolDefinition,
} from "../src/create-brmem-plan.ts";

const ROOT = "/repo";
const PLAN_SLUG = "branch-scoped-plan-extension";
const PLAN_KEY = `${PLAN_SLUG}.md`;

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type ExecOptions = Parameters<ExtensionAPI["exec"]>[2];

type ExecCall = {
	command: string;
	args: string[];
	options: ExecOptions;
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

function brmemCheckStep(key: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["check", key, "--namespace", "plans", "--format", "json"], result);
}

function brmemPutStep(key: string, filePath: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["put", key, "--namespace", "plans", "--file", filePath, "--format", "json"], result);
}

async function makeTempDir(prefix = "create-brmem-plan-"): Promise<string> {
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

function putEnvelope(filePath: string, key: string = PLAN_KEY): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: "plans",
			key,
			branch: "feature/foo",
			ref_name: `refs/brmem/ns/plans/feature---foo:${key}`,
			commit: "abc123",
			source_file: filePath,
		},
	});
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
	const tool = pi.tools.get("persist_brmem_plan");
	expect(tool).toBeDefined();
	if (!tool) {
		throw new Error("persist_brmem_plan was not registered");
	}
	return tool;
}

async function executePersistTool(params: unknown, script: ScriptedExec[], cwd: string = ROOT): Promise<{
	pi: FakePi;
	result: Awaited<ReturnType<ToolDefinition["execute"]>>;
}> {
	const pi = new FakePi(script);
	createBrmemPlanExtension(pi);
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

describe("buildCreateBrmemPlanPrompt", () => {
	test("includes steering and persistence instructions", () => {
		const prompt = buildCreateBrmemPlanPrompt("look at docs/pi/core-subagent-mvp-spec.md");

		expect(prompt).toContain("/create-brmem-plan request");
		expect(prompt).toContain("look at docs/pi/core-subagent-mvp-spec.md");
		expect(prompt).toContain("Do not create a checked-in plan file");
		expect(prompt).toContain("Choose the slug from the final plan content");
		expect(prompt).toContain("call persist_brmem_plan with");
		expect(prompt).toContain("Branch Memory namespace: plans");
		expect(prompt).toContain("Entry key: <semantic-slug>.md");
	});

	test("renders empty steering as none", () => {
		expect(buildCreateBrmemPlanPrompt("   ")).toContain("User steering for this planning request: (none)");
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

describe("create-brmem-plan command", () => {
	test("registers command and tool", () => {
		const pi = new FakePi();
		createBrmemPlanExtension(pi);

		expect(pi.commands.has("create-brmem-plan")).toBe(true);
		expect(pi.tools.has("persist_brmem_plan")).toBe(true);
	});

	test("waits for idle before dispatching the generated prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		createBrmemPlanExtension(pi);
		const command = pi.commands.get("create-brmem-plan");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("  add a Pi command that persists plans in brmem  ", context.ctx);

		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("add a Pi command that persists plans in brmem");
		expect(context.notifications).toEqual([
			{ message: "Starting brmem-backed planning turn…", level: "info" },
		]);
	});

	test("empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi();
		createBrmemPlanExtension(pi);
		const command = pi.commands.get("create-brmem-plan");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});
});

describe("persist_brmem_plan tool", () => {
	test("rejects invalid slug before running commands", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi();
		createBrmemPlanExtension(pi);
		const tool = registeredTool(pi);

		await expect(
			tool.execute("tool-call", { slug: "Branch Scoped Plan", filePath }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("Invalid Branch Memory plan slug");
		expect(pi.execCalls).toEqual([]);
	});

	test("rejects non-absolute and missing file paths before brmem commands", async () => {
		const pi = new FakePi();
		createBrmemPlanExtension(pi);
		const tool = registeredTool(pi);

		await expect(
			tool.execute("tool-call", { slug: PLAN_SLUG, filePath: "plan.md" }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("Plan file path must be absolute");

		const missing = join(await makeTempDir(), "missing.md");
		await expect(
			tool.execute("tool-call", { slug: PLAN_SLUG, filePath: missing }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("Plan file does not exist");

		expect(pi.execCalls).toEqual([]);
	});

	test("rejects file path inside repo root when git root resolves", async () => {
		const repoRoot = await makeTempDir("repo-root-");
		const filePath = join(repoRoot, "plan.md");
		await writeFile(filePath, "# Plan\n", "utf8");
		const pi = new FakePi([gitRootStep(repoRoot)]);
		createBrmemPlanExtension(pi);
		const tool = registeredTool(pi);

		await expect(
			tool.execute("tool-call", { slug: PLAN_SLUG, filePath }, undefined, undefined, { cwd: repoRoot }),
		).rejects.toThrow("Plan file must be a temp file outside the repository");
		pi.assertDone();
		expect(pi.execCalls).toHaveLength(1);
	});

	test("runs brmem check and refuses when the plan exists", async () => {
		const filePath = await makePlanFile();
		const pi = new FakePi([gitRootStep(), brmemCheckStep(PLAN_KEY, { code: 0, stdout: "{}" })]);
		createBrmemPlanExtension(pi);
		const tool = registeredTool(pi);

		await expect(
			tool.execute("tool-call", { slug: PLAN_SLUG, filePath }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("Branch Memory plan already exists");

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["git", "brmem"]);
	});

	test("treats brmem check exit code 1 as absent, then runs brmem put", async () => {
		const filePath = await makePlanFile();
		const { pi, result } = await executePersistTool(
			{ slug: PLAN_SLUG, filePath, summary: "Plan the brmem-backed command." },
			[
				gitRootStep(),
				brmemCheckStep(PLAN_KEY, { code: 1, stderr: "absent" }),
				brmemPutStep(PLAN_KEY, filePath, { stdout: putEnvelope(filePath) }),
			],
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", "plans", "--format", "json"] },
			{ command: "brmem", args: ["put", PLAN_KEY, "--namespace", "plans", "--file", filePath, "--format", "json"] },
		]);
		expect(result.content[0]?.text).toContain("Stored Branch Memory plan.");
		expect(result.content[0]?.text).toContain(`Namespace: plans`);
		expect(result.content[0]?.text).toContain(`Key: ${PLAN_KEY}`);
		expect(result.content[0]?.text).toContain("Branch: feature/foo");
		expect(result.content[0]?.text).toContain(`Ref: refs/brmem/ns/plans/feature---foo:${PLAN_KEY}`);
		expect(result.content[0]?.text).toContain("Commit: abc123");
		expect(result.content[0]?.text).toContain(`Source file: ${filePath}`);
		expect(result.content[0]?.text).toContain("Summary: Plan the brmem-backed command.");
		expect(result.details).toEqual({
			namespace: "plans",
			key: PLAN_KEY,
			slug: PLAN_SLUG,
			branch: "feature/foo",
			refName: `refs/brmem/ns/plans/feature---foo:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: filePath,
			summary: "Plan the brmem-backed command.",
		});
	});

	test("surfaces brmem check exit code 2 as failure", async () => {
		const filePath = await makePlanFile();
		await expect(
			executePersistTool(
				{ slug: PLAN_SLUG, filePath },
				[gitRootStep(), brmemCheckStep(PLAN_KEY, { code: 2, stderr: "detached HEAD" })],
			),
		).rejects.toThrow("brmem check failed");
	});

	test("surfaces malformed put JSON as failure", async () => {
		const filePath = await makePlanFile();
		await expect(
			executePersistTool(
				{ slug: PLAN_SLUG, filePath },
				[
					gitRootStep(),
					brmemCheckStep(PLAN_KEY, { code: 1 }),
					brmemPutStep(PLAN_KEY, filePath, { stdout: "not json" }),
				],
			),
		).rejects.toThrow("Malformed brmem put JSON");
	});
});

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import objectiveExtension, {
	completeObjectiveListArgs,
	parseObjectiveListArgs,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
	type NotifyLevel,
} from "../src/objective.ts";

const ROOT = "/repo";
const TRUNK = "master";

const OBJECTIVE_COMMAND_NAMES = ["objective:next", "objective:current", "objective:update"] as const;
type ObjectiveCommandName = (typeof OBJECTIVE_COMMAND_NAMES)[number];
type ObjectiveSkillName = "objective-next" | "objective-current" | "objective-update";

const OBJECTIVE_SKILLS_BY_COMMAND: Record<ObjectiveCommandName, ObjectiveSkillName> = {
	"objective:next": "objective-next",
	"objective:current": "objective-current",
	"objective:update": "objective-update",
};

const SELECTION_TITLES: Record<ObjectiveCommandName, string> = {
	"objective:next": "Select an active Objective for next work or execution preview",
	"objective:current": "Select an active Objective to summarize",
	"objective:update": "Select an active Objective to update",
};

const ACTION_PROMPTS: Record<ObjectiveCommandName, string> = {
	"objective:next": "Run objective-next for this explicitly selected Objective slug or path:",
	"objective:current": "Run objective-current for this explicitly selected Objective slug or path:",
	"objective:update": "Run objective-update for this explicitly selected Objective slug or path:",
};

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type CommandInfo = ReturnType<ExtensionAPI["getCommands"]>[number];

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
	error?: unknown;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface Selection {
	title: string;
	items: string[];
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly sentMessages: Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0][] = [];
	readonly sentUserMessages: string[] = [];
	private readonly script: ScriptedExec[];
	private readonly commandInfos: ReturnType<ExtensionAPI["getCommands"]>;

	constructor(script: ScriptedExec[] = [], commandInfos: ReturnType<ExtensionAPI["getCommands"]> = []) {
		this.script = [...script];
		this.commandInfos = [...commandInfos];
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
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

		if (expected.error) {
			throw expected.error;
		}

		return execResult(expected.result);
	}

	getCommands(): ReturnType<ExtensionAPI["getCommands"]> {
		return this.commandInfos;
	}

	sendMessage(message: Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0]): void {
		this.sentMessages.push(message);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

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

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

function createContext(options: { cancelSelect?: boolean; selectIndex?: number; selectIndices?: number[] } = {}): {
	ctx: CommandContext;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const selections: Selection[] = [];
	let waits = 0;

	const ctx: CommandContext = {
		cwd: ROOT,
		hasUI: true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async select(title: string, items: string[]): Promise<string | undefined> {
				const callIndex = selections.length;
				selections.push({ title, items: [...items] });
				if (options.cancelSelect) {
					return undefined;
				}
				return items[options.selectIndices?.[callIndex] ?? options.selectIndex ?? 0];
			},
			setStatus(): void {},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, selections, waitForIdleCalls: () => waits };
}

const STACK_SKILL_MARKDOWN = `---
name: objective-stack-impl
hidden-frontmatter-token: do-not-include
---

# Test Objective Stack Skill

Use the selected Objective.
`;

function skillCommandInfo(skillName: string, skillPath: string, baseDir: string): CommandInfo {
	return {
		name: `skill:${skillName}`,
		source: "skill",
		sourceInfo: {
			path: skillPath,
			source: "project",
			scope: "project",
			origin: "top-level",
			baseDir,
		},
	};
}

async function withTempSkill<T>(
	skillName: string,
	markdown: string,
	callback: (skillPath: string, skillDir: string) => Promise<T>,
): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), `${skillName}-`));
	const skillPath = join(dir, "SKILL.md");
	await writeFile(skillPath, markdown, "utf8");
	try {
		return await callback(skillPath, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function runObjectiveStackImpl(
	args: string,
	script: ScriptedExec[] = [],
	contextOptions: { cancelSelect?: boolean; selectIndex?: number; selectIndices?: number[] } = {},
	commandInfos: CommandInfo[] = [],
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script, commandInfos);
	objectiveExtension(pi);
	const command = pi.commands.get("objective:stack-impl");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("objective:stack-impl was not registered");
	}

	const context = createContext(contextOptions);
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

async function runObjectiveNext(
	args: string,
	script: ScriptedExec[],
	contextOptions: { cancelSelect?: boolean; selectIndex?: number; selectIndices?: number[] } = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script);
	objectiveExtension(pi);
	const command = pi.commands.get("objective:next");
	expect(command).toBeDefined();
	const context = createContext(contextOptions);
	await command?.handler(args, context.ctx);
	return { pi, ...context };
}

async function runObjectiveCommand(
	commandName: ObjectiveCommandName,
	args: string,
	script: ScriptedExec[] = [],
	contextOptions: { cancelSelect?: boolean; selectIndex?: number; selectIndices?: number[] } = {},
	commandInfos: CommandInfo[] = [],
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script, commandInfos);
	objectiveExtension(pi);
	const command = pi.commands.get(commandName);
	expect(command).toBeDefined();
	if (!command) {
		throw new Error(`${commandName} was not registered`);
	}

	const context = createContext(contextOptions);
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

async function runObjectiveList(args: string, script: ScriptedExec[] = []): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script);
	objectiveExtension(pi);
	const command = pi.commands.get("objective:list");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("objective:list was not registered");
	}

	const context = createContext();
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

function expectListActiveObjectivesCall(result: { pi: FakePi }): void {
	expect(result.pi.execCalls[0]).toEqual({
		command: "objective",
		args: ["list", "--format", "json"],
		options: { cwd: ROOT, timeout: 30_000 },
	});
}

function expectPromptSelectsObjective(
	commandName: ObjectiveCommandName,
	prompt: string | undefined,
	objective: string,
): void {
	expect(prompt).toContain(ACTION_PROMPTS[commandName]);
	expect(prompt).toContain(`\`\`\`text\n${objective}\n\`\`\``);
	expect(prompt).toContain("Treat this as an explicit user selection. Do not auto-select a different Objective.");
}

function objectiveList(slugs: string[], trunkBranch: string = TRUNK): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			trunk_branch: trunkBranch,
			root_path: ".asdl/objectives",
			status_filter: "active",
			names_only: false,
			records: slugs.map((slug, index) => ({
				slug,
				status: "open",
				latest_update_iso: `2026-01-0${index + 1}T00:00:00Z`,
			})),
		},
	});
}

function listStep(slugs: string[], trunkBranch: string = TRUNK): ScriptedExec {
	return step("objective", ["list", "--format", "json"], { stdout: objectiveList(slugs, trunkBranch) });
}

function diffStep(stdout: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["diff", "--name-status", "-M", `${TRUNK}...HEAD`, "--", ".asdl/objectives"], {
		stdout,
		...result,
	});
}

function statusStep(stdout: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["status", "--porcelain=v1", "-z", "--", ".asdl/objectives"], {
		stdout,
		...result,
	});
}

function completionValues(prefix: string): string[] {
	return completeObjectiveListArgs(prefix)?.map((item) => item.value) ?? [];
}

function expectInvalidObjectiveListArgs(result: ReturnType<typeof parseObjectiveListArgs>, pattern: RegExp): void {
	expect(result.type).toBe("invalid");
	if (result.type === "invalid") {
		expect(result.message).toMatch(pattern);
	}
}

describe("objective:list command", () => {
	test("completions advertise checkout-local options and status values", () => {
		expect(completionValues("")).toEqual(["--names", "--status", "--help", "-h"]);
		expect(completionValues("")).not.toContain("--current");
		expect(completionValues("")).not.toContain("--view");
		expect(completionValues("--status ")).toEqual(["all", "active", "open", "closed"]);
		expect(completionValues("--status=o")).toEqual(["--status=open"]);
		expect(completionValues("--view")).toEqual([]);
	});

	test("parses accepted checkout-local list arguments", () => {
		expect(parseObjectiveListArgs("--names --status all")).toEqual({
			type: "valid",
			args: {
				args: ["--names", "--status", "all"],
				help: false,
			},
		});
		expect(parseObjectiveListArgs("--status=closed")).toEqual({
			type: "valid",
			args: {
				args: ["--status", "closed"],
				help: false,
			},
		});
		expect(parseObjectiveListArgs("--help")).toEqual({ type: "valid", args: { args: [], help: true } });
	});

	test("rejects removed and unsupported list arguments", () => {
		expectInvalidObjectiveListArgs(parseObjectiveListArgs("--current"), /--current is no longer supported/);
		expectInvalidObjectiveListArgs(parseObjectiveListArgs("--view detail"), /--view is no longer supported/);
		expectInvalidObjectiveListArgs(
			parseObjectiveListArgs("--status in-flight"),
			/Unsupported --status value: in-flight/,
		);
		expectInvalidObjectiveListArgs(parseObjectiveListArgs("--format json"), /--format is controlled/);
		expectInvalidObjectiveListArgs(parseObjectiveListArgs("--json-schema"), /--json-schema is not supported/);
	});

	test("forwards accepted status arguments with markdown format controlled by the extension", async () => {
		const result = await runObjectiveList("--names --status all", [
			step("objective", ["list", "--names", "--status", "all", "--format", "markdown"], { stdout: "alpha\n" }),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls[0]).toEqual({
			command: "objective",
			args: ["list", "--names", "--status", "all", "--format", "markdown"],
			options: { cwd: ROOT, timeout: 30_000 },
		});
		expect(result.pi.sentMessages[0]?.content).toBe("alpha");
	});

	test("rejects removed flags before invoking objective list", async () => {
		const current = await runObjectiveList("--current");
		const view = await runObjectiveList("--view detail");

		expect(current.pi.execCalls).toEqual([]);
		expect(view.pi.execCalls).toEqual([]);
		expect(current.pi.sentMessages[0]?.content).toContain("--current is no longer supported");
		expect(view.pi.sentMessages[0]?.content).toContain("--view is no longer supported");
	});
});

test("does not register removed Objective Graphite stack wrapper", () => {
	const pi = new FakePi();
	const removedCommand = ["objective", ["gt", "stacks"].join("-")].join(":");

	objectiveExtension(pi);

	expect(pi.commands.has(removedCommand)).toBe(false);
});


describe("objective:stack-impl command", () => {
	test("registers the skill-backed wrapper command", () => {
		const pi = new FakePi();

		objectiveExtension(pi);

		expect(pi.commands.has("objective:stack-impl")).toBe(true);
	});

	test("explicit slug bypasses objective list, git evidence, and recursive slash dispatch", async () => {
		await withTempSkill("objective-stack-impl", STACK_SKILL_MARKDOWN, async (skillPath, skillDir) => {
			const result = await runObjectiveStackImpl("  bravo  ", [], {}, [
				skillCommandInfo("objective-stack-impl", skillPath, skillDir),
			]);

			result.pi.assertDone();
			expect(result.pi.execCalls).toEqual([]);
			expect(result.selections).toEqual([]);
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			expect(result.pi.sentUserMessages[0]).toContain(`<skill name="objective-stack-impl" location="${skillPath}">`);
			expect(result.pi.sentUserMessages[0]).toContain("# Test Objective Stack Skill\n\nUse the selected Objective.");
			expect(result.pi.sentUserMessages[0]).not.toContain("hidden-frontmatter-token");
			expect(result.pi.sentUserMessages[0]).toContain(
				"Run objective-stack-impl for this explicitly selected Objective slug or path:",
			);
			expect(result.pi.sentUserMessages[0]).toContain("```text\nbravo\n```");
			expect(result.pi.sentUserMessages[0]?.startsWith("/objective:stack-impl")).toBe(false);
			expect(result.notifications).toContainEqual({
				message: "Invoking objective:stack-impl for bravo.",
				level: "info",
			});
		});
	});

	test("explicit slug falls back when the portable skill is unavailable", async () => {
		const result = await runObjectiveStackImpl("bravo");

		result.pi.assertDone();
		expect(result.pi.execCalls).toEqual([]);
		expect(result.pi.sentUserMessages[0]).toContain("The objective-stack-impl skill was not found among loaded Pi skills.");
		expect(result.pi.sentUserMessages[0]).toContain("```text\nbravo\n```");
		expect(result.notifications).toContainEqual({
			message: "objective-stack-impl skill was not found; using fallback prompt.",
			level: "warning",
		});
	});

	test("empty args load active candidates with objective list json and git evidence", async () => {
		await withTempSkill("objective-stack-impl", STACK_SKILL_MARKDOWN, async (skillPath, skillDir) => {
			const result = await runObjectiveStackImpl(
				"",
				[listStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
				{},
				[skillCommandInfo("objective-stack-impl", skillPath, skillDir)],
			);

			result.pi.assertDone();
			expectListActiveObjectivesCall(result);
			expect(result.pi.execCalls[1]).toEqual({
				command: "git",
				args: ["diff", "--name-status", "-M", "master...HEAD", "--", ".asdl/objectives"],
				options: { cwd: ROOT, timeout: 30_000 },
			});
			expect(result.pi.execCalls[2]).toEqual({
				command: "git",
				args: ["status", "--porcelain=v1", "-z", "--", ".asdl/objectives"],
				options: { cwd: ROOT, timeout: 30_000 },
			});
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.sentUserMessages[0]).toContain("```text\nalpha\n```");
		});
	});

	test("changed Objective grouping matches objective-next", async () => {
		await withTempSkill("objective-stack-impl", STACK_SKILL_MARKDOWN, async (skillPath, skillDir) => {
			const result = await runObjectiveStackImpl(
				"",
				[
					listStep(["alpha", "bravo", "charlie"]),
					diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
					statusStep(""),
				],
				{},
				[skillCommandInfo("objective-stack-impl", skillPath, skillDir)],
			);

			result.pi.assertDone();
			expect(result.selections[0]).toEqual({
				title: "Select an active Objective for stack implementation (only Objective changed vs master)",
				items: [
					"bravo — suggested: only Objective changed vs master — open — latest update 2026-01-02T00:00:00Z",
					"View other active Objectives…",
				],
			});
			expect(result.pi.sentUserMessages[0]).toContain("```text\nbravo\n```");
		});
	});

	test("View other active Objectives opens a second picker and sends the selected other slug", async () => {
		await withTempSkill("objective-stack-impl", STACK_SKILL_MARKDOWN, async (skillPath, skillDir) => {
			const result = await runObjectiveStackImpl(
				"",
				[
					listStep(["alpha", "bravo", "charlie"]),
					diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
					statusStep(""),
				],
				{ selectIndices: [1, 1] },
				[skillCommandInfo("objective-stack-impl", skillPath, skillDir)],
			);

			result.pi.assertDone();
			expect(result.selections[1]).toEqual({
				title: "Select an active Objective for stack implementation (other active Objectives)",
				items: [
					"alpha — open — latest update 2026-01-01T00:00:00Z",
					"charlie — open — latest update 2026-01-03T00:00:00Z",
				],
			});
			expect(result.pi.sentUserMessages[0]).toContain("```text\ncharlie\n```");
		});
	});

	test("picker cancellation sends no prompt", async () => {
		const result = await runObjectiveStackImpl(
			"",
			[listStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
			{ cancelSelect: true },
		);

		result.pi.assertDone();
		expect(result.notifications).toEqual([{ message: "Objective selection cancelled.", level: "info" }]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("zero active Objectives sends no prompt", async () => {
		const result = await runObjectiveStackImpl("", [listStep([])]);

		result.pi.assertDone();
		expect(result.notifications).toEqual([
			{ message: "No active Objectives. Create one with /skill:objective-create.", level: "info" },
		]);
		expect(result.selections).toEqual([]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});
});

describe("objective picker suggestion", () => {
	test("shows only the one changed active Objective before offering the rest", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next work or execution preview (only Objective changed vs master)",
			items: [
				"bravo — suggested: only Objective changed vs master — open — latest update 2026-01-02T00:00:00Z",
				"View other active Objectives…",
			],
		});
		expect(result.selections).toHaveLength(1);
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
		expect(result.notifications.some((notification) => notification.message === "Suggested bravo from objective diff vs master.")).toBe(
			false,
		);
	});

	test("dirty-only single active Objective is suggested with checkout wording", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep(""),
			statusStep(" M .asdl/objectives/bravo/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next work or execution preview (only Objective changed in checkout or vs master)",
			items: [
				"bravo — suggested: only Objective changed in checkout or vs master — open — latest update 2026-01-02T00:00:00Z",
				"View other active Objectives…",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
	});

	test("dirty-only suggestion uses checkout wording when trunk is unavailable", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"], ""),
			statusStep(" M .asdl/objectives/bravo/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => call.args[0])).toEqual(["list", "status"]);
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next work or execution preview (only Objective changed in checkout)",
			items: [
				"bravo — suggested: only Objective changed in checkout — open — latest update 2026-01-02T00:00:00Z",
				"View other active Objectives…",
			],
		});
	});

	test("dirty and committed diff slugs are unioned changed-first", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie", "delta"]),
			diffStep("M\t.asdl/objectives/alpha/objective.md\n"),
			statusStep(" M .asdl/objectives/charlie/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next work or execution preview (changed Objectives in checkout or vs master)",
			items: [
				"alpha — changed in checkout or vs master — open — latest update 2026-01-01T00:00:00Z",
				"charlie — changed in checkout or vs master — open — latest update 2026-01-03T00:00:00Z",
				"View other active Objectives…",
			],
		});
		expect(result.selections).toHaveLength(1);
		expect(result.pi.sentUserMessages[0]).toContain("alpha");
	});

	test("dirty slug not in active records is ignored", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep(""),
			statusStep(" M .asdl/objectives/closed-objective/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.selections[0]?.items).toEqual([
			"alpha — open — latest update 2026-01-01T00:00:00Z",
			"bravo — open — latest update 2026-01-02T00:00:00Z",
		]);
	});

	test("opens a second picker for the other Objectives when requested", async () => {
		const result = await runObjectiveNext(
			"",
			[
				listStep(["alpha", "bravo", "charlie"]),
				diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
				statusStep(""),
			],
			{ selectIndices: [1, 1] },
		);

		result.pi.assertDone();
		expect(result.selections[1]).toEqual({
			title: "Select an active Objective for next work or execution preview (other active Objectives)",
			items: [
				"alpha — open — latest update 2026-01-01T00:00:00Z",
				"charlie — open — latest update 2026-01-03T00:00:00Z",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("charlie");
	});

	test("shows changed active Objectives before offering the rest", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie", "delta"]),
			diffStep([
				"M\t.asdl/objectives/alpha/objective.md",
				"M\t.asdl/objectives/charlie/roadmap.md",
			].join("\n")),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next work or execution preview (changed Objectives vs master)",
			items: [
				"alpha — changed vs master — open — latest update 2026-01-01T00:00:00Z",
				"charlie — changed vs master — open — latest update 2026-01-03T00:00:00Z",
				"View other active Objectives…",
			],
		});
		expect(result.selections).toHaveLength(1);
		expect(result.pi.sentUserMessages[0]).toContain("alpha");
	});

	test("opens a second picker for non-changed Objectives after the changed Objectives menu", async () => {
		const result = await runObjectiveNext(
			"",
			[
				listStep(["alpha", "bravo", "charlie", "delta"]),
				diffStep([
					"M\t.asdl/objectives/alpha/objective.md",
					"M\t.asdl/objectives/charlie/roadmap.md",
				].join("\n")),
				statusStep(""),
			],
			{ selectIndices: [2, 1] },
		);

		result.pi.assertDone();
		expect(result.selections[1]).toEqual({
			title: "Select an active Objective for next work or execution preview (other active Objectives)",
			items: [
				"bravo — open — latest update 2026-01-02T00:00:00Z",
				"delta — open — latest update 2026-01-04T00:00:00Z",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("delta");
	});

	test("omits the View other choice when all active Objectives changed", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep(["M\t.asdl/objectives/alpha/objective.md", "M\t.asdl/objectives/bravo/objective.md"].join("\n")),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next work or execution preview (changed Objectives vs master)",
			items: [
				"alpha — changed vs master — open — latest update 2026-01-01T00:00:00Z",
				"bravo — changed vs master — open — latest update 2026-01-02T00:00:00Z",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("alpha");
	});

	test("does not suggest when the changed Objective slug is not active", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep("M\t.asdl/objectives/closed-objective/objective.md\n"),
			statusStep(""),
		]);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"alpha — open — latest update 2026-01-01T00:00:00Z",
			"bravo — open — latest update 2026-01-02T00:00:00Z",
		]);
		expect(items.some((item) => item.includes("suggested"))).toBe(false);
	});

	test("filters inactive changed Objective slugs before diff suggestions", async () => {
		const result = await runObjectiveNext("", [
			listStep(["pi-extension-deepening"]),
			diffStep([
				"A\t.asdl/objectives/pi-extension-architecture-deepening/closed.md",
				"M\t.asdl/objectives/pi-extension-deepening/objective.md",
			].join("\n")),
			statusStep(""),
		]);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"pi-extension-deepening — changed vs master — open — latest update 2026-01-01T00:00:00Z",
		]);
		expect(items.some((item) => item.includes("pi-extension-architecture-deepening"))).toBe(false);
		expect(result.pi.sentUserMessages[0]).toContain("pi-extension-deepening");
		expect(result.pi.sentUserMessages[0]).not.toContain("pi-extension-architecture-deepening");
	});

	test("does not claim only Objective changed when a changed slug is not active", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep([
				"M\t.asdl/objectives/bravo/objective.md",
				"M\t.asdl/objectives/closed-objective/objective.md",
			].join("\n")),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next work or execution preview (changed Objectives vs master)",
			items: [
				"bravo — changed vs master — open — latest update 2026-01-02T00:00:00Z",
				"View other active Objectives…",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
	});

	test("bypasses suggestion logic when an explicit slug is provided", async () => {
		const result = await runObjectiveNext("bravo", []);

		result.pi.assertDone();
		expect(result.pi.execCalls).toEqual([]);
		expect(result.selections).toEqual([]);
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
	});

	test("git status failure preserves committed diff suggestions", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
			statusStep("", { code: 1, stderr: "status failed" }),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next work or execution preview (only Objective changed vs master)",
			items: [
				"bravo — suggested: only Objective changed vs master — open — latest update 2026-01-02T00:00:00Z",
				"View other active Objectives…",
			],
		});
	});

	test("git diff failure still allows dirty status suggestions", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep("", { code: 1, stderr: "fatal: bad revision" }),
			statusStep(" M .asdl/objectives/bravo/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next work or execution preview (only Objective changed in checkout or vs master)",
			items: [
				"bravo — suggested: only Objective changed in checkout or vs master — open — latest update 2026-01-02T00:00:00Z",
				"View other active Objectives…",
			],
		});
	});

	test("falls back to the normal picker when git diff and status fail", async () => {
		const result = await runObjectiveNext(
			"",
			[
				listStep(["alpha", "bravo"]),
				diffStep("", { code: 1, stderr: "fatal: bad revision" }),
				statusStep("", { code: 1, stderr: "status failed" }),
			],
			{ cancelSelect: true },
		);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"alpha — open — latest update 2026-01-01T00:00:00Z",
			"bravo — open — latest update 2026-01-02T00:00:00Z",
		]);
		expect(result.notifications).toEqual([{ message: "Objective selection cancelled.", level: "info" }]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});
});

describe("objective command shared selection policy", () => {
	test("empty-args picker commands never invoke the removed --current list flag", async () => {
		for (const commandName of OBJECTIVE_COMMAND_NAMES) {
			const result = await runObjectiveCommand(commandName, "", [listStep([])]);

			result.pi.assertDone();
			expect(result.pi.execCalls[0]?.args).toEqual(["list", "--format", "json"]);
			expect(result.pi.execCalls[0]?.args).not.toContain("--current");
		}

		const stackResult = await runObjectiveStackImpl("", [listStep([])]);

		stackResult.pi.assertDone();
		expect(stackResult.pi.execCalls[0]?.args).toEqual(["list", "--format", "json"]);
		expect(stackResult.pi.execCalls[0]?.args).not.toContain("--current");
	});

	for (const commandName of OBJECTIVE_COMMAND_NAMES) {
		describe(commandName, () => {
			test("explicit slug or path bypasses objective list and git evidence", async () => {
				const explicitObjective = ".asdl/objectives/bravo/objective.md";
				const result = await runObjectiveCommand(commandName, `  ${explicitObjective}  `);
				const skillName = OBJECTIVE_SKILLS_BY_COMMAND[commandName];

				result.pi.assertDone();
				expect(result.pi.execCalls).toEqual([]);
				expect(result.selections).toEqual([]);
				expect(result.waitForIdleCalls()).toBe(1);
				expectPromptSelectsObjective(commandName, result.pi.sentUserMessages[0], explicitObjective);
				expect(result.pi.sentUserMessages[0]).toContain(
					`The ${skillName} skill was not found among loaded Pi skills.`,
				);
				expect(result.notifications).toContainEqual({
					message: `${skillName} skill was not found; using fallback prompt.`,
					level: "warning",
				});
			});

			test("empty args load active candidates with objective list json", async () => {
				const result = await runObjectiveCommand(
					commandName,
					"",
					[listStep(["alpha"]), diffStep(""), statusStep("")],
					{ cancelSelect: true },
				);

				result.pi.assertDone();
				expectListActiveObjectivesCall(result);
				expect(result.selections).toHaveLength(1);
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("zero active Objectives notify and send no prompt", async () => {
				const result = await runObjectiveCommand(commandName, "", [listStep([])]);

				result.pi.assertDone();
				expect(result.pi.execCalls).toHaveLength(1);
				expectListActiveObjectivesCall(result);
				expect(result.notifications).toEqual([
					{ message: "No active Objectives. Create one with /skill:objective-create.", level: "info" },
				]);
				expect(result.selections).toEqual([]);
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("invalid objective list JSON notifies and sends no prompt", async () => {
				const result = await runObjectiveCommand(commandName, "", [
					step("objective", ["list", "--format", "json"], { stdout: "{" }),
				]);

				result.pi.assertDone();
				expect(result.pi.execCalls).toHaveLength(1);
				expectListActiveObjectivesCall(result);
				expect(result.notifications[0]?.message).toContain("Malformed objective list JSON");
				expect(result.notifications[0]?.level).toBe("error");
				expect(result.selections).toEqual([]);
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("picker cancellation sends no prompt", async () => {
				const result = await runObjectiveCommand(
					commandName,
					"",
					[
						listStep(["alpha", "bravo"]),
						diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
						statusStep(""),
					],
					{ cancelSelect: true },
				);

				result.pi.assertDone();
				expect(result.notifications).toContainEqual({
					message: "Objective selection cancelled.",
					level: "info",
				});
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("selected slug is embedded as an explicit selection in the generated skill prompt", async () => {
				const result = await runObjectiveCommand(
					commandName,
					"",
					[listStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
					{ selectIndex: 0 },
				);

				result.pi.assertDone();
				expectPromptSelectsObjective(commandName, result.pi.sentUserMessages[0], "alpha");
			});
		});
	}
});

describe("objective command prompt details", () => {
	test("expanded skill block appears in an objective prompt for an explicit slug", async () => {
		const dir = await mkdtemp(join(tmpdir(), "objective-next-skill-"));
		const skillPath = join(dir, "SKILL.md");
		await writeFile(
			skillPath,
			`---
name: objective-next
hidden-frontmatter-token: do-not-include
---

# Objective Next Skill

Use the selected Objective.
`,
			"utf8",
		);

		try {
			const result = await runObjectiveCommand("objective:next", "bravo", [], {}, [
				skillCommandInfo("objective-next", skillPath, dir),
			]);

			result.pi.assertDone();
			const prompt = result.pi.sentUserMessages[0] ?? "";
			expect(prompt).toContain(`<skill name="objective-next" location="${skillPath}">`);
			expect(prompt).toContain(`References are relative to ${dir}.`);
			expect(prompt).toContain("# Objective Next Skill\n\nUse the selected Objective.");
			expect(prompt).not.toContain("hidden-frontmatter-token");
			expect(prompt).toContain("Run objective-next for this explicitly selected Objective slug or path:");
			expect(prompt).toContain("```text\nbravo\n```");
			expect(result.notifications).toContainEqual({
				message: "Invoking objective-next for bravo.",
				level: "info",
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("objective-update prompt includes the post-selection evidence workflow reminder", async () => {
		const result = await runObjectiveCommand("objective:update", "bravo");

		result.pi.assertDone();
		expect(result.pi.sentUserMessages[0]).toContain(
			"After this explicit selection, follow objective-update's normal post-selection evidence workflow.",
		);
	});

	test("non-update prompts do not include the objective-update evidence workflow reminder", async () => {
		for (const commandName of ["objective:next", "objective:current"] as const) {
			const result = await runObjectiveCommand(commandName, "bravo");

			result.pi.assertDone();
			expect(result.pi.sentUserMessages[0]).not.toContain("normal post-selection evidence workflow");
		}
	});
});

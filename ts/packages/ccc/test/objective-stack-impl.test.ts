import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerObjectiveStackImplCommand, type ObjectiveStackImplCommandContext, type ObjectiveStackImplHost } from "../src/objective-stack-impl.ts";
import type { ExecResult } from "@asdl/pi-extension-runtime/command-runtime";

const ROOT = "/repo";
const TRUNK = "master";

type RegisteredCommand = Parameters<ObjectiveStackImplHost["registerCommand"]>[1];
type CommandInfo = ReturnType<ObjectiveStackImplHost["getCommands"]>[number];
type NotifyLevel = "info" | "warning" | "error";

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

class FakeHost implements ObjectiveStackImplHost {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly sentUserMessages: string[] = [];
	private readonly script: ScriptedExec[];
	private readonly commandInfos: ReturnType<ObjectiveStackImplHost["getCommands"]>;

	constructor(script: ScriptedExec[] = [], commandInfos: ReturnType<ObjectiveStackImplHost["getCommands"]> = []) {
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

	getCommands(): ReturnType<ObjectiveStackImplHost["getCommands"]> {
		return this.commandInfos;
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
	ctx: ObjectiveStackImplCommandContext;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const selections: Selection[] = [];
	let waits = 0;

	const ctx: ObjectiveStackImplCommandContext = {
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
	host: FakeHost;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const host = new FakeHost(script, commandInfos);
	registerObjectiveStackImplCommand(host);
	const command = host.commands.get("objective:stack-impl");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("objective:stack-impl was not registered");
	}

	const context = createContext(contextOptions);
	await command.handler(args, context.ctx);
	return { host, ...context };
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

function expectListActiveObjectivesCall(result: { host: FakeHost }): void {
	expect(result.host.execCalls[0]).toEqual({
		command: "objective",
		args: ["list", "--format", "json"],
		options: { cwd: ROOT, timeout: 30_000 },
	});
}

describe("objective stack impl CCC orchestration", () => {
	test("registers the public objective:stack-impl command", () => {
		const host = new FakeHost();

		registerObjectiveStackImplCommand(host);

		expect(host.commands.has("objective:stack-impl")).toBe(true);
	});

	test("explicit slug bypasses objective list, git evidence, and recursive slash dispatch", async () => {
		await withTempSkill("objective-stack-impl", STACK_SKILL_MARKDOWN, async (skillPath, skillDir) => {
			const result = await runObjectiveStackImpl("  bravo  ", [], {}, [
				skillCommandInfo("objective-stack-impl", skillPath, skillDir),
			]);

			result.host.assertDone();
			expect(result.host.execCalls).toEqual([]);
			expect(result.selections).toEqual([]);
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.host.sentUserMessages).toHaveLength(1);
			expect(result.host.sentUserMessages[0]).toContain(`<skill name="objective-stack-impl" location="${skillPath}">`);
			expect(result.host.sentUserMessages[0]).toContain("# Test Objective Stack Skill\n\nUse the selected Objective.");
			expect(result.host.sentUserMessages[0]).not.toContain("hidden-frontmatter-token");
			expect(result.host.sentUserMessages[0]).toContain(
				"Run objective-stack-impl for this explicitly selected Objective slug or path:",
			);
			expect(result.host.sentUserMessages[0]).toContain("```text\nbravo\n```");
			expect(result.host.sentUserMessages[0]?.startsWith("/objective:stack-impl")).toBe(false);
			expect(result.notifications).toContainEqual({
				message: "Invoking objective:stack-impl for bravo.",
				level: "info",
			});
		});
	});

	test("explicit slug falls back when the portable skill is unavailable", async () => {
		const result = await runObjectiveStackImpl("bravo");

		result.host.assertDone();
		expect(result.host.execCalls).toEqual([]);
		expect(result.host.sentUserMessages[0]).toContain("The objective-stack-impl skill was not found among loaded Pi skills.");
		expect(result.host.sentUserMessages[0]).toContain("```text\nbravo\n```");
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

			result.host.assertDone();
			expectListActiveObjectivesCall(result);
			expect(result.host.execCalls[1]).toEqual({
				command: "git",
				args: ["diff", "--name-status", "-M", "master...HEAD", "--", ".asdl/objectives"],
				options: { cwd: ROOT, timeout: 30_000 },
			});
			expect(result.host.execCalls[2]).toEqual({
				command: "git",
				args: ["status", "--porcelain=v1", "-z", "--", ".asdl/objectives"],
				options: { cwd: ROOT, timeout: 30_000 },
			});
			expect(result.host.sentUserMessages[0]).toContain("```text\nalpha\n```");
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

			result.host.assertDone();
			expect(result.selections[0]).toEqual({
				title: "Select an active Objective for stack implementation (only Objective changed vs master)",
				items: [
					"bravo — suggested: only Objective changed vs master — open — latest update 2026-01-02T00:00:00Z",
					"View other active Objectives…",
				],
			});
			expect(result.host.sentUserMessages[0]).toContain("```text\nbravo\n```");
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

			result.host.assertDone();
			expect(result.selections[1]).toEqual({
				title: "Select an active Objective for stack implementation (other active Objectives)",
				items: [
					"alpha — open — latest update 2026-01-01T00:00:00Z",
					"charlie — open — latest update 2026-01-03T00:00:00Z",
				],
			});
			expect(result.host.sentUserMessages[0]).toContain("```text\ncharlie\n```");
		});
	});

	test("picker cancellation sends no prompt", async () => {
		const result = await runObjectiveStackImpl(
			"",
			[listStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
			{ cancelSelect: true },
		);

		result.host.assertDone();
		expect(result.notifications).toEqual([{ message: "Objective selection cancelled.", level: "info" }]);
		expect(result.host.sentUserMessages).toEqual([]);
	});

	test("zero active Objectives sends no prompt", async () => {
		const result = await runObjectiveStackImpl("", [listStep([])]);

		result.host.assertDone();
		expect(result.notifications).toEqual([
			{ message: "No active Objectives. Create one with /skill:objective-create.", level: "info" },
		]);
		expect(result.selections).toEqual([]);
		expect(result.host.sentUserMessages).toEqual([]);
	});
});

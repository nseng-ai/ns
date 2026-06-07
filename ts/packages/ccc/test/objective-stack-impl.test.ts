import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerObjectiveStackImplCommand, type ObjectiveStackImplHost } from "../src/objective-stack-impl.ts";
import {
	FakeCommandContext,
	ROOT,
	objectiveListStep,
	runScriptedExec,
	skillCommand,
	step,
	type ExecCall,
	type Notification,
	type ScriptedExec,
	type Selection,
} from "./ccc-test-harness.ts";
import type { ExecResult } from "@asdl/pi-extension-runtime/command-runtime";
import type { ObjectiveSelectionContext } from "@asdl/pi-extension-runtime/objective-selection";

const TRUNK = "master";

type RegisteredCommand = Parameters<ObjectiveStackImplHost["registerCommand"]>[1];
type CommandInfo = ReturnType<ObjectiveStackImplHost["getCommands"]>[number];

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
		return runScriptedExec({
			script: this.script,
			execCalls: this.execCalls,
			errors: this.errors,
			command,
			args,
			options,
			requireExpectedArgs: true,
		});
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

const STACK_SKILL_MARKDOWN = `---
name: objective-stack-impl
hidden-frontmatter-token: do-not-include
---

# Test Objective Stack Skill

Use the selected Objective.
`;

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

interface RunObjectiveStackImplOptions {
	args: string;
	script?: ScriptedExec[];
	contextOptions?: { cancelSelect?: boolean; selectIndex?: number; selectIndices?: number[] };
	commandInfos?: CommandInfo[];
}

async function runObjectiveStackImpl(options: RunObjectiveStackImplOptions): Promise<{
	host: FakeHost;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const { args, script = [], contextOptions = {}, commandInfos = [] } = options;
	const host = new FakeHost(script, commandInfos);
	registerObjectiveStackImplCommand(host);
	const command = host.commands.get("objective:stack-impl");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("objective:stack-impl was not registered");
	}

	const fakeContextOptions: ConstructorParameters<typeof FakeCommandContext>[0] = { cwd: ROOT };
	if (contextOptions.cancelSelect !== undefined) {
		fakeContextOptions.cancelSelect = contextOptions.cancelSelect;
	}
	const selectIndices = contextOptions.selectIndices ?? (contextOptions.selectIndex === undefined ? undefined : [contextOptions.selectIndex]);
	if (selectIndices !== undefined) {
		fakeContextOptions.selectIndices = selectIndices;
	}
	const fakeContext = new FakeCommandContext(fakeContextOptions);
	const context: ObjectiveSelectionContext = {
		cwd: fakeContext.cwd,
		hasUI: fakeContext.hasUI,
		ui: {
			notify: fakeContext.ui.notify,
			select: (title, items) => fakeContext.ui.select!(title, items),
			setStatus: fakeContext.ui.setStatus!,
		},
		waitForIdle: () => fakeContext.waitForIdle(),
	};
	await command.handler(args, context);
	return {
		host,
		notifications: fakeContext.notifications,
		selections: fakeContext.selections,
		waitForIdleCalls: () => fakeContext.waitCount,
	};
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
		await withTempSkill("objective-stack-impl", STACK_SKILL_MARKDOWN, async (skillPath) => {
			const result = await runObjectiveStackImpl({
				args: "  bravo  ",
				commandInfos: [skillCommand("objective-stack-impl", skillPath)],
			});

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
		const result = await runObjectiveStackImpl({ args: "bravo" });

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
		await withTempSkill("objective-stack-impl", STACK_SKILL_MARKDOWN, async (skillPath) => {
			const result = await runObjectiveStackImpl({
				args: "",
				script: [objectiveListStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
				commandInfos: [skillCommand("objective-stack-impl", skillPath)],
			});

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
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.host.sentUserMessages[0]).toContain("```text\nalpha\n```");
		});
	});

	test("changed Objective grouping matches objective-next", async () => {
		await withTempSkill("objective-stack-impl", STACK_SKILL_MARKDOWN, async (skillPath) => {
			const result = await runObjectiveStackImpl({
				args: "",
				script: [
					objectiveListStep(["alpha", "bravo", "charlie"]),
					diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
					statusStep(""),
				],
				commandInfos: [skillCommand("objective-stack-impl", skillPath)],
			});

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
		await withTempSkill("objective-stack-impl", STACK_SKILL_MARKDOWN, async (skillPath) => {
			const result = await runObjectiveStackImpl({
				args: "",
				script: [
					objectiveListStep(["alpha", "bravo", "charlie"]),
					diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
					statusStep(""),
				],
				contextOptions: { selectIndices: [1, 1] },
				commandInfos: [skillCommand("objective-stack-impl", skillPath)],
			});

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
		const result = await runObjectiveStackImpl({
			args: "",
			script: [objectiveListStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
			contextOptions: { cancelSelect: true },
		});

		result.host.assertDone();
		expect(result.notifications).toEqual([{ message: "Objective selection cancelled.", level: "info" }]);
		expect(result.host.sentUserMessages).toEqual([]);
	});

	test("zero active Objectives sends no prompt", async () => {
		const result = await runObjectiveStackImpl({ args: "", script: [objectiveListStep([])] });

		result.host.assertDone();
		expect(result.notifications).toEqual([
			{ message: "No active Objectives. Create one with /skill:objective-create.", level: "info" },
		]);
		expect(result.selections).toEqual([]);
		expect(result.host.sentUserMessages).toEqual([]);
	});
});

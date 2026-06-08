import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { registerObjectiveStackImplCommand } from "../src/objective-stack-impl.ts";
import {
	FakeCommandContext,
	FakePi,
	ROOT,
	objectiveListStep,
	resetCmuxTestEnvironment,
	skillCommand,
	step,
	type Notification,
	type ScriptedExec,
	type Selection,
	writeSelfContainedSkillMarkdown,
} from "./ccc-test-harness.ts";
import type { ExecResult } from "@asdl/pi-extension-runtime/command-runtime";

const TRUNK = "master";

type CommandInfo = ReturnType<FakePi["getCommands"]>[number];

const STACK_SKILL_MARKDOWN = `---
name: objective-stack-impl
hidden-frontmatter-token: do-not-include
---

# Test Objective Stack Skill

Use the selected Objective.
`;

let stackSkillPath = "";

beforeAll(async () => {
	stackSkillPath = await writeSelfContainedSkillMarkdown(STACK_SKILL_MARKDOWN);
});

afterAll(async () => {
	await resetCmuxTestEnvironment();
});

interface RunObjectiveStackImplOptions {
	args: string;
	script?: ScriptedExec[];
	contextOptions?: { shouldCancelSelect?: boolean; selectIndices?: number[] };
	commandInfos?: CommandInfo[];
}

async function runObjectiveStackImpl(options: RunObjectiveStackImplOptions): Promise<{
	host: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const { args, script = [], contextOptions = {}, commandInfos = [] } = options;
	const host = new FakePi({ script, skillCommands: commandInfos, shouldRequireExpectedArgs: true });
	registerObjectiveStackImplCommand(host);
	const command = host.commands.get("objective:stack-impl");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("objective:stack-impl was not registered");
	}

	const fakeContext = new FakeCommandContext({
		cwd: ROOT,
		shouldCancelSelect: contextOptions.shouldCancelSelect,
		selectIndices: contextOptions.selectIndices,
	});
	await command.handler(args, fakeContext);
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

function expectListActiveObjectivesCall(result: { host: FakePi }): void {
	expect(result.host.execCalls[0]).toEqual({
		command: "objective",
		args: ["list", "--format", "json"],
		options: { cwd: ROOT, timeout: 30_000 },
	});
}

describe("objective stack impl CCC orchestration", () => {
	test("registers the public objective:stack-impl command", () => {
		const host = new FakePi({ shouldRequireExpectedArgs: true });

		registerObjectiveStackImplCommand(host);

		expect(host.commands.has("objective:stack-impl")).toBe(true);
	});

	test("explicit slug bypasses objective list, git evidence, and recursive slash dispatch", async () => {
		const result = await runObjectiveStackImpl({
			args: "  bravo  ",
			commandInfos: [skillCommand("objective-stack-impl", stackSkillPath)],
		});

		result.host.assertDone();
		expect(result.host.execCalls).toEqual([]);
		expect(result.selections).toEqual([]);
		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.host.sentUserMessages).toHaveLength(1);
		expect(result.host.sentUserMessages[0]).toContain(`<skill name="objective-stack-impl" location="${stackSkillPath}">`);
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
		const result = await runObjectiveStackImpl({
			args: "",
			script: [objectiveListStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
			commandInfos: [skillCommand("objective-stack-impl", stackSkillPath)],
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
		expect(result.waitForIdleCalls()).toBe(2);
		expect(result.host.sentUserMessages[0]).toContain("```text\nalpha\n```");
	});

	test("changed Objective grouping matches objective-next", async () => {
		const result = await runObjectiveStackImpl({
			args: "",
			script: [
				objectiveListStep(["alpha", "bravo", "charlie"]),
				diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
				statusStep(""),
			],
			commandInfos: [skillCommand("objective-stack-impl", stackSkillPath)],
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

	test("View other active Objectives opens a second picker and sends the selected other slug", async () => {
		const result = await runObjectiveStackImpl({
			args: "",
			script: [
				objectiveListStep(["alpha", "bravo", "charlie"]),
				diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
				statusStep(""),
			],
			contextOptions: { selectIndices: [1, 1] },
			commandInfos: [skillCommand("objective-stack-impl", stackSkillPath)],
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

	test("picker cancellation sends no prompt", async () => {
		const result = await runObjectiveStackImpl({
			args: "",
			script: [objectiveListStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
			contextOptions: { shouldCancelSelect: true },
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

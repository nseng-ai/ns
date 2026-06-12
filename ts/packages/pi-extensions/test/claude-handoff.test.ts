import { describe, expect, test } from "vitest";

import {
	CLAUDE_HANDOFF_COMMAND_NAME,
	CLAUDE_HANDOFF_LAUNCH_TOOL_NAME,
	buildClaudeHandoffPrompt,
	buildClaudePickupPrompt,
	registerClaudeHandoffCommand,
	scrubClaudeEnv,
	type InteractiveClaudeInvocation,
	type InteractiveClaudeRunResult,
} from "../src/claude/handoff-command.ts";
import {
	BRANCH,
	FakePi,
	ROOT,
	branchStep,
	createContext,
	skillCommandInfo,
	step,
	withTempSkill,
} from "./handoff-test-fakes.ts";

interface FakeRunClaude {
	(invocation: InteractiveClaudeInvocation): InteractiveClaudeRunResult;
	readonly invocations: InteractiveClaudeInvocation[];
}

function fakeRunClaude(result: InteractiveClaudeRunResult): FakeRunClaude {
	const invocations: InteractiveClaudeInvocation[] = [];
	const runClaude = ((invocation: InteractiveClaudeInvocation): InteractiveClaudeRunResult => {
		invocations.push({ ...invocation, env: { ...invocation.env } });
		return result;
	}) as FakeRunClaude;
	Object.defineProperty(runClaude, "invocations", { value: invocations });
	return runClaude;
}

function registerTestCommand(pi: FakePi, runClaude = fakeRunClaude({ type: "exited", code: 0, signal: null }), env = {}): FakeRunClaude {
	registerClaudeHandoffCommand(pi, { runClaude, env });
	return runClaude;
}

describe("claude handoff command", () => {
	test("registers claude:handoff and launch tool", () => {
		const pi = new FakePi();
		registerTestCommand(pi);

		expect([...pi.commands.keys()]).toEqual([CLAUDE_HANDOFF_COMMAND_NAME]);
		expect([...pi.tools.keys()]).toEqual([CLAUDE_HANDOFF_LAUNCH_TOOL_NAME]);
		expect(pi.commands.get(CLAUDE_HANDOFF_COMMAND_NAME)?.description).toBe(
			"Create a handoff, then pick it up in an interactive Claude Code session.",
		);
	});

	test.each([
		{ name: "rpc mode", options: { mode: "rpc" as const, customUi: true } },
		{ name: "missing mode", options: { customUi: true } },
		{ name: "missing custom UI", options: { mode: "tui" as const, customUi: false } },
	])("refuses command outside an interactive TUI: $name", async ({ options }) => {
		const pi = new FakePi();
		const runClaude = registerTestCommand(pi);
		const context = createContext(options);
		const command = pi.commands.get(CLAUDE_HANDOFF_COMMAND_NAME);
		expect(command).toBeDefined();
		if (command === undefined) {
			throw new Error(`${CLAUDE_HANDOFF_COMMAND_NAME} was not registered`);
		}

		await command.handler("focus", context.ctx);

		pi.assertDone();
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(runClaude.invocations).toEqual([]);
		expect(context.notifications).toEqual([
			{
				message: "/claude:handoff requires interactive TUI mode so the terminal can be handed to Claude Code after the handoff is created.",
				level: "error",
			},
		]);
	});

	test("command prompts the current Pi session to create the handoff before launching Claude", async () => {
		await withTempSkill(async (skillPath) => {
			const pi = new FakePi([branchStep()], [skillCommandInfo(skillPath)]);
			registerTestCommand(pi);
			const context = createContext({ mode: "tui", customUi: true });
			const command = pi.commands.get(CLAUDE_HANDOFF_COMMAND_NAME);
			expect(command).toBeDefined();
			if (command === undefined) {
				throw new Error(`${CLAUDE_HANDOFF_COMMAND_NAME} was not registered`);
			}

			await command.handler("handoff the auth work", context.ctx);

			pi.assertDone();
			expect(context.waitForIdleCalls()).toBe(1);
			expect(context.tuiEvents).toEqual([]);
			expect(context.notifications).toEqual([{ message: "Starting Claude handoff create workflow…", level: "info" }]);
			expect(pi.sentUserMessages).toHaveLength(1);
			expect(pi.sentUserMessages[0]).toContain(`<skill name="handoff-create" location="${skillPath}">`);
			expect(pi.sentUserMessages[0]).toContain("Create a directed handoff artifact for the current Pi session before launching Claude Code");
			expect(pi.sentUserMessages[0]).toContain("```text\nhandoff the auth work\n```");
			expect(pi.sentUserMessages[0]).toContain(`--branch ${BRANCH}`);
			expect(pi.sentUserMessages[0]).toContain(CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);
			expect(pi.sentUserMessages[0]).toContain("Do not call claude_handoff_launch before the handoff is saved successfully.");
		});
	});

	test("command prompts for focus when args are empty", async () => {
		const pi = new FakePi([branchStep()]);
		registerTestCommand(pi);
		const context = createContext({ mode: "tui", customUi: true, inputResponse: "continue from handoff" });
		const command = pi.commands.get(CLAUDE_HANDOFF_COMMAND_NAME);
		expect(command).toBeDefined();
		if (command === undefined) {
			throw new Error(`${CLAUDE_HANDOFF_COMMAND_NAME} was not registered`);
		}

		await command.handler("", context.ctx);

		pi.assertDone();
		expect(context.inputs).toEqual([{ title: "What should the future session continue from this handoff?", placeholder: undefined }]);
		expect(pi.sentUserMessages[0]).toContain("continue from handoff");
	});

	test.each([
		{ name: "git failure", branch: step("git", ["branch", "--show-current"], { code: 128, stderr: "fatal" }), message: /command failed/ },
		{ name: "detached HEAD", branch: step("git", ["branch", "--show-current"], { stdout: "\n" }), message: /detached HEAD/ },
	])("command does not create prompt when branch lookup fails: $name", async ({ branch, message }) => {
		const pi = new FakePi([branch]);
		const runClaude = registerTestCommand(pi);
		const context = createContext({ mode: "tui", customUi: true });
		const command = pi.commands.get(CLAUDE_HANDOFF_COMMAND_NAME);
		expect(command).toBeDefined();
		if (command === undefined) {
			throw new Error(`${CLAUDE_HANDOFF_COMMAND_NAME} was not registered`);
		}

		await command.handler("focus", context.ctx);

		pi.assertDone();
		expect(runClaude.invocations).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.tuiEvents).toEqual([]);
		expect(context.notifications[0]?.message).toMatch(message);
		expect(context.notifications[0]?.level).toBe("error");
	});

	test("launch tool verifies the handoff exists and launches Claude with pickup instructions", async () => {
		const env = { PATH: "/bin", HOME: "/home/me", ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "token" };
		const pi = new FakePi([step("brmem", ["check", "fix-auth-flow.md", "--namespace", "handoff", "--branch", BRANCH], { code: 0 })]);
		const runClaude = registerTestCommand(pi, fakeRunClaude({ type: "exited", code: 0, signal: null }), env);
		const context = createContext({ mode: "tui", customUi: true });
		const tool = pi.tools.get(CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error(`${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} was not registered`);
		}

		const result = await tool.execute("tool-call", { branch: BRANCH, slug: "fix-auth-flow" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toBe("Claude Code exited after pickup.");
		expect(context.tuiEvents).toEqual(["stop", "start", "requestRender(true)"]);
		expect(runClaude.invocations).toHaveLength(1);
		expect(runClaude.invocations[0]?.cwd).toBe(ROOT);
		expect(runClaude.invocations[0]?.prompt).toContain("handoff-pickup");
		expect(runClaude.invocations[0]?.prompt).toContain(`Branch: ${BRANCH}`);
		expect(runClaude.invocations[0]?.prompt).toContain("Entry: fix-auth-flow.md");
		expect(runClaude.invocations[0]?.prompt).toContain(`/handoff:pickup --branch ${BRANCH} fix-auth-flow`);
		expect(runClaude.invocations[0]?.prompt).toContain("Do not create a new handoff");
		expect(runClaude.invocations[0]?.env).toEqual({ PATH: "/bin", HOME: "/home/me" });
		expect(env).toEqual({ PATH: "/bin", HOME: "/home/me", ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "token" });
	});

	test.each([
		{ name: "rpc mode", options: { mode: "rpc" as const, customUi: true } },
		{ name: "missing custom UI", options: { mode: "tui" as const, customUi: false } },
	])("launch tool refuses outside interactive TUI: $name", async ({ options }) => {
		const pi = new FakePi();
		const runClaude = registerTestCommand(pi);
		const context = createContext(options);
		const tool = pi.tools.get(CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error(`${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} was not registered`);
		}

		const result = await tool.execute("tool-call", { branch: BRANCH, slug: "fix-auth-flow" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("requires interactive TUI mode");
		expect(runClaude.invocations).toEqual([]);
	});

	test("launch tool refuses invalid params before checking Branch Memory", async () => {
		const pi = new FakePi();
		const runClaude = registerTestCommand(pi);
		const context = createContext({ mode: "tui", customUi: true });
		const tool = pi.tools.get(CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error(`${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} was not registered`);
		}

		const result = await tool.execute("tool-call", { branch: BRANCH, slug: "Bad.md" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("must not include .md");
		expect(runClaude.invocations).toEqual([]);
	});

	test.each([
		{
			name: "missing handoff",
			check: step("brmem", ["check", "fix-auth-flow.md", "--namespace", "handoff", "--branch", BRANCH], { code: 1 }),
			expected: "does not exist",
		},
		{
			name: "check failure",
			check: step("brmem", ["check", "fix-auth-flow.md", "--namespace", "handoff", "--branch", BRANCH], { code: 2, stderr: "boom" }),
			expected: "command failed",
		},
	])("launch tool does not launch when verification reports $name", async ({ check, expected }) => {
		const pi = new FakePi([check]);
		const runClaude = registerTestCommand(pi);
		const context = createContext({ mode: "tui", customUi: true });
		const tool = pi.tools.get(CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error(`${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} was not registered`);
		}

		const result = await tool.execute("tool-call", { branch: BRANCH, slug: "fix-auth-flow" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain(expected);
		expect(runClaude.invocations).toEqual([]);
		expect(context.tuiEvents).toEqual([]);
	});

	test("launch tool reports spawn failure after resuming the TUI", async () => {
		const pi = new FakePi([step("brmem", ["check", "fix-auth-flow.md", "--namespace", "handoff", "--branch", BRANCH], { code: 0 })]);
		const runClaude = registerTestCommand(pi, fakeRunClaude({ type: "spawn-failed", message: "spawn claude ENOENT" }));
		const context = createContext({ mode: "tui", customUi: true });
		const tool = pi.tools.get(CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error(`${CLAUDE_HANDOFF_LAUNCH_TOOL_NAME} was not registered`);
		}

		const result = await tool.execute("tool-call", { branch: BRANCH, slug: "fix-auth-flow" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("Is Claude Code installed and on PATH?");
		expect(context.tuiEvents).toEqual(["stop", "start", "requestRender(true)"]);
		expect(runClaude.invocations).toHaveLength(1);
	});

	test("pure helpers build create and pickup prompts and scrub env", () => {
		const createPrompt = buildClaudeHandoffPrompt({ skillBlock: undefined, request: { branch: BRANCH, focus: "continue work" } });
		expect(createPrompt).toContain("handoff-create workflow");
		expect(createPrompt).toContain("before launching Claude Code");
		expect(createPrompt).toContain("```text\ncontinue work\n```");
		expect(createPrompt).toContain(CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);

		const pickupPrompt = buildClaudePickupPrompt(BRANCH, "continue-work");
		expect(pickupPrompt).toContain("handoff-pickup");
		expect(pickupPrompt).toContain("Entry: continue-work.md");
		expect(pickupPrompt).toContain("Do not create a new handoff");

		const env = { PATH: "/bin", ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "token", EMPTY: undefined };
		const scrubbed = scrubClaudeEnv(env);
		expect(scrubbed).toEqual({ PATH: "/bin", EMPTY: undefined });
		expect(env).toEqual({ PATH: "/bin", ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "token", EMPTY: undefined });
	});
});

import { describe, expect, test } from "vitest";

import {
	CLAUDE_HANDOFF_COMMAND_NAME,
	CLAUDE_HANDOFF_LAUNCH_TOOL_NAME,
	buildClaudeHandoffPrompt,
	buildClaudeHandoffSessionName,
	buildClaudePickupPrompt,
	deriveSourcePiSessionId,
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
	checkStep,
	createContext,
	getRegisteredCommand,
	getRegisteredTool,
	legacyMissingCheckStep,
	skillCommandInfo,
	step,
	withTempSkill,
} from "./handoff-test-fakes.ts";

interface FakeRunClaude {
	run(invocation: InteractiveClaudeInvocation): InteractiveClaudeRunResult;
	readonly invocations: InteractiveClaudeInvocation[];
}

function fakeRunClaude(result: InteractiveClaudeRunResult): FakeRunClaude {
	const invocations: InteractiveClaudeInvocation[] = [];
	return {
		invocations,
		run(invocation: InteractiveClaudeInvocation): InteractiveClaudeRunResult {
			invocations.push({ ...invocation, env: { ...invocation.env } });
			return result;
		},
	};
}

interface RegisterTestCommandOptions {
	runClaude?: FakeRunClaude;
	env?: Record<string, string | undefined>;
}

function registerTestCommand(pi: FakePi, options: RegisterTestCommandOptions = {}): FakeRunClaude {
	const runClaude = options.runClaude ?? fakeRunClaude({ type: "exited", code: 0, signal: null });
	registerClaudeHandoffCommand(pi, { runClaude: runClaude.run, env: options.env ?? {} });
	return runClaude;
}

describe("claude handoff command", () => {
	test("registers claude:handoff and launch tool", () => {
		const pi = new FakePi();
		registerTestCommand(pi);

		expect([...pi.commands.keys()]).toEqual([CLAUDE_HANDOFF_COMMAND_NAME]);
		expect([...pi.tools.keys()]).toEqual([CLAUDE_HANDOFF_LAUNCH_TOOL_NAME]);
		expect(getRegisteredCommand(pi, CLAUDE_HANDOFF_COMMAND_NAME).description).toBe(
			"Create a handoff, then pick it up in an interactive Claude Code session.",
		);
	});

	test.each([
		{ name: "rpc mode", options: { mode: "rpc" as const, hasCustomUi: true } },
		{ name: "missing custom UI", options: { mode: "tui" as const, hasCustomUi: false } },
	])("refuses command outside an interactive TUI: $name", async ({ options }) => {
		const pi = new FakePi();
		const runClaude = registerTestCommand(pi);
		const context = createContext(options);
		const command = getRegisteredCommand(pi, CLAUDE_HANDOFF_COMMAND_NAME);

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
		await withTempSkill(async (skillPath, repoDir) => {
			const pi = new FakePi([branchStep()], [skillCommandInfo(skillPath)]);
			registerTestCommand(pi);
			const context = createContext({ mode: "tui", hasCustomUi: true, cwd: repoDir });
			const command = getRegisteredCommand(pi, CLAUDE_HANDOFF_COMMAND_NAME);

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
		const context = createContext({ mode: "tui", hasCustomUi: true, inputResponse: "continue from handoff" });
		const command = getRegisteredCommand(pi, CLAUDE_HANDOFF_COMMAND_NAME);

		await command.handler("", context.ctx);

		pi.assertDone();
		expect(context.inputs).toEqual([{ title: "What should the future session continue from this handoff?", placeholder: undefined }]);
		expect(pi.sentUserMessages[0]).toContain("continue from handoff");
	});

	test("command validates continuation focus before creating prompt", async () => {
		const pi = new FakePi([branchStep()]);
		const runClaude = registerTestCommand(pi);
		const context = createContext({ mode: "tui", hasCustomUi: true });
		const command = getRegisteredCommand(pi, CLAUDE_HANDOFF_COMMAND_NAME);

		await command.handler("!!!", context.ctx);

		pi.assertDone();
		expect(runClaude.invocations).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.notifications).toEqual([
			{ message: "Continuation focus must contain at least one letter or number.", level: "error" },
		]);
	});

	test.each([
		{ name: "git failure", branch: step("git", ["branch", "--show-current"], { code: 128, stderr: "fatal" }), message: /command failed/ },
		{ name: "detached HEAD", branch: step("git", ["branch", "--show-current"], { stdout: "\n" }), message: /detached HEAD/ },
	])("command does not create prompt when branch lookup fails: $name", async ({ branch, message }) => {
		const pi = new FakePi([branch]);
		const runClaude = registerTestCommand(pi);
		const context = createContext({ mode: "tui", hasCustomUi: true });
		const command = getRegisteredCommand(pi, CLAUDE_HANDOFF_COMMAND_NAME);

		await command.handler("focus", context.ctx);

		pi.assertDone();
		expect(runClaude.invocations).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.tuiEvents).toEqual([]);
		expect(context.notifications[0]?.message).toMatch(message);
		expect(context.notifications[0]?.level).toBe("error");
	});

	test("launch tool verifies the handoff exists and launches Claude with pickup instructions", async () => {
		const env = {
			PATH: "/bin",
			HOME: "/home/me",
			ANTHROPIC_API_KEY: "secret",
			ANTHROPIC_AUTH_TOKEN: "token",
			ANTHROPIC_BASE_URL: "https://anthropic.example",
		};
		const pi = new FakePi([checkStep(BRANCH, "fix-auth-flow.md", true)]);
		const runClaude = registerTestCommand(pi, { runClaude: fakeRunClaude({ type: "exited", code: 0, signal: null }), env });
		const context = createContext({ mode: "tui", hasCustomUi: true });
		const tool = getRegisteredTool(pi, CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);

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
		expect(runClaude.invocations[0]?.name).toBe("[from-pi] handoff: fix-auth-flow");
		expect(runClaude.invocations[0]?.env).toEqual({ PATH: "/bin", HOME: "/home/me" });
		expect(env).toEqual({
			PATH: "/bin",
			HOME: "/home/me",
			ANTHROPIC_API_KEY: "secret",
			ANTHROPIC_AUTH_TOKEN: "token",
			ANTHROPIC_BASE_URL: "https://anthropic.example",
		});
	});

	test("launch tool names the Claude session with the source Pi session id when available", async () => {
		const pi = new FakePi([checkStep(BRANCH, "fix-auth-flow.md", true)]);
		const runClaude = registerTestCommand(pi);
		const context = createContext({ mode: "tui", hasCustomUi: true, sessionFile: "/home/me/.pi/sessions/sess-9f3c.jsonl" });
		const tool = getRegisteredTool(pi, CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);

		const result = await tool.execute("tool-call", { branch: BRANCH, slug: "fix-auth-flow" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBeUndefined();
		expect(runClaude.invocations).toHaveLength(1);
		expect(runClaude.invocations[0]?.name).toBe("[from-pi] session-id:sess-9f3c handoff: fix-auth-flow");
	});

	test.each([
		{ name: "rpc mode", options: { mode: "rpc" as const, hasCustomUi: true } },
		{ name: "missing custom UI", options: { mode: "tui" as const, hasCustomUi: false } },
	])("launch tool refuses outside interactive TUI: $name", async ({ options }) => {
		const pi = new FakePi();
		const runClaude = registerTestCommand(pi);
		const context = createContext(options);
		const tool = getRegisteredTool(pi, CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);

		const result = await tool.execute("tool-call", { branch: BRANCH, slug: "fix-auth-flow" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("requires interactive TUI mode");
		expect(runClaude.invocations).toEqual([]);
	});

	test("launch tool refuses invalid params before checking Branch Memory", async () => {
		const pi = new FakePi();
		const runClaude = registerTestCommand(pi);
		const context = createContext({ mode: "tui", hasCustomUi: true });
		const tool = getRegisteredTool(pi, CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);

		const result = await tool.execute("tool-call", { branch: BRANCH, slug: "Bad.md" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("must not include .md");
		expect(runClaude.invocations).toEqual([]);
	});

	test.each([
		{
			name: "missing handoff",
			check: checkStep(BRANCH, "fix-auth-flow.md", false),
			expected: "does not exist",
		},
		{
			name: "legacy shell-mode missing handoff",
			check: legacyMissingCheckStep(BRANCH, "fix-auth-flow.md"),
			expected: "does not exist",
		},
		{
			name: "check failure",
			check: step("brmem", ["check", "fix-auth-flow.md", "--namespace", "handoff", "--branch", BRANCH, "--format", "json"], { code: 2, stderr: "boom" }),
			expected: "command failed",
		},
	])("launch tool does not launch when verification reports $name", async ({ check, expected }) => {
		const pi = new FakePi([check]);
		const runClaude = registerTestCommand(pi);
		const context = createContext({ mode: "tui", hasCustomUi: true });
		const tool = getRegisteredTool(pi, CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);

		const result = await tool.execute("tool-call", { branch: BRANCH, slug: "fix-auth-flow" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain(expected);
		expect(runClaude.invocations).toEqual([]);
		expect(context.tuiEvents).toEqual([]);
	});

	test("launch tool reports spawn failure after resuming the TUI", async () => {
		const pi = new FakePi([checkStep(BRANCH, "fix-auth-flow.md", true)]);
		const runClaude = registerTestCommand(pi, { runClaude: fakeRunClaude({ type: "spawn-failed", message: "spawn claude ENOENT" }) });
		const context = createContext({ mode: "tui", hasCustomUi: true });
		const tool = getRegisteredTool(pi, CLAUDE_HANDOFF_LAUNCH_TOOL_NAME);

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
		expect(createPrompt).toContain(`\`\`\`text\n/handoff:pickup --branch ${BRANCH} <returned-slug>\n\`\`\``);

		const pickupPrompt = buildClaudePickupPrompt(BRANCH, "continue-work");
		expect(pickupPrompt).toContain("handoff-pickup");
		expect(pickupPrompt).toContain("Entry: continue-work.md");
		expect(pickupPrompt).toContain("Do not create a new handoff");

		const env = {
			PATH: "/bin",
			ANTHROPIC_API_KEY: "secret",
			ANTHROPIC_AUTH_TOKEN: "token",
			ANTHROPIC_BASE_URL: "https://anthropic.example",
			EMPTY: undefined,
		};
		const scrubbed = scrubClaudeEnv(env);
		expect(scrubbed).toEqual({ PATH: "/bin", EMPTY: undefined });
		expect(env).toEqual({
			PATH: "/bin",
			ANTHROPIC_API_KEY: "secret",
			ANTHROPIC_AUTH_TOKEN: "token",
			ANTHROPIC_BASE_URL: "https://anthropic.example",
			EMPTY: undefined,
		});
	});

	test.each([
		{
			name: "timestamped session id keeps only the id segment",
			input: "/home/me/.pi/sessions/2026-06-12T06-03-30-136Z_019eba6d-abd8-7fa8-bb1f-1888f3b09a56.jsonl",
			expected: "019eba6d-abd8-7fa8-bb1f-1888f3b09a56",
		},
		{ name: "posix path with extension", input: "/home/me/.pi/sessions/sess-9f3c.jsonl", expected: "sess-9f3c" },
		{ name: "windows path with extension", input: "C:\\Users\\me\\sessions\\abc123.jsonl", expected: "abc123" },
		{ name: "bare filename", input: "sess-9f3c.jsonl", expected: "sess-9f3c" },
		{ name: "no extension", input: "/sessions/abc123", expected: "abc123" },
		{ name: "multiple dots strips only last", input: "/sessions/2026-06-12.abc.jsonl", expected: "2026-06-12.abc" },
		{ name: "multiple underscores keeps last segment", input: "/sessions/ts_extra_id.jsonl", expected: "id" },
		{ name: "surrounding whitespace", input: "  /sessions/abc123.jsonl  ", expected: "abc123" },
		{ name: "undefined", input: undefined, expected: undefined },
		{ name: "empty string", input: "", expected: undefined },
		{ name: "whitespace only", input: "   ", expected: undefined },
		{ name: "directory path with trailing slash", input: "/sessions/", expected: undefined },
		{ name: "dotfile only", input: "/sessions/.jsonl", expected: undefined },
		{ name: "trailing underscore has no id segment", input: "/sessions/2026-06-12T06-03-30-136Z_.jsonl", expected: undefined },
	])("deriveSourcePiSessionId: $name", ({ input, expected }) => {
		expect(deriveSourcePiSessionId(input)).toBe(expected);
	});

	test("buildClaudeHandoffSessionName includes the session id when derivable and falls back otherwise", () => {
		expect(buildClaudeHandoffSessionName("fix-auth-flow", "/sessions/sess-9f3c.jsonl")).toBe(
			"[from-pi] session-id:sess-9f3c handoff: fix-auth-flow",
		);
		expect(
			buildClaudeHandoffSessionName("fix-auth-flow", "/home/me/.pi/sessions/2026-06-12T06-03-30-136Z_019eba6d-abd8-7fa8-bb1f-1888f3b09a56.jsonl"),
		).toBe("[from-pi] session-id:019eba6d-abd8-7fa8-bb1f-1888f3b09a56 handoff: fix-auth-flow");
		expect(buildClaudeHandoffSessionName("fix-auth-flow", undefined)).toBe("[from-pi] handoff: fix-auth-flow");
		expect(buildClaudeHandoffSessionName("fix-auth-flow", "/sessions/")).toBe("[from-pi] handoff: fix-auth-flow");
	});
});

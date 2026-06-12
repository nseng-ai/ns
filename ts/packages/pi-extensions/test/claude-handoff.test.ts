import { describe, expect, test } from "vitest";

import {
	CLAUDE_HANDOFF_COMMAND_NAME,
	buildClaudeSeedPrompt,
	diffNewHandoffItems,
	registerClaudeHandoffCommand,
	scrubClaudeEnv,
	type InteractiveClaudeInvocation,
	type InteractiveClaudeRunResult,
} from "../src/claude/handoff-command.ts";
import type { HandoffListItem } from "../src/handoff.ts";
import {
	BRANCH,
	FakePi,
	ROOT,
	branchStep,
	createContext,
	getStep,
	listStep,
	step,
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

async function runClaudeHandoff(
	args: string,
	script = [branchStep(), listStep(BRANCH, []), listStep(BRANCH, [])],
	result: InteractiveClaudeRunResult = { type: "exited", code: 0, signal: null },
	env: Record<string, string | undefined> = {},
): Promise<{
	pi: FakePi;
	runClaude: FakeRunClaude;
	notifications: ReturnType<typeof createContext>["notifications"];
	statuses: ReturnType<typeof createContext>["statuses"];
	tuiEvents: string[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script);
	const runClaude = registerTestCommand(pi, fakeRunClaude(result), env);
	const context = createContext({ mode: "tui", customUi: true });
	const command = pi.commands.get(CLAUDE_HANDOFF_COMMAND_NAME);
	expect(command).toBeDefined();
	if (command === undefined) {
		throw new Error(`${CLAUDE_HANDOFF_COMMAND_NAME} was not registered`);
	}
	await command.handler(args, context.ctx);
	return { pi, runClaude, ...context };
}

describe("claude handoff command", () => {
	test("registers claude:handoff with a description", () => {
		const pi = new FakePi();
		registerTestCommand(pi);

		expect([...pi.commands.keys()]).toEqual([CLAUDE_HANDOFF_COMMAND_NAME]);
		expect(pi.commands.get(CLAUDE_HANDOFF_COMMAND_NAME)?.description).toBe(
			"Author a handoff in an interactive Claude Code session.",
		);
	});

	test.each([
		{ name: "rpc mode", options: { mode: "rpc" as const, customUi: true } },
		{ name: "missing mode", options: { customUi: true } },
		{ name: "missing custom UI", options: { mode: "tui" as const, customUi: false } },
	])("refuses outside an interactive TUI: $name", async ({ options }) => {
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
		expect(runClaude.invocations).toEqual([]);
		expect(context.notifications).toEqual([
			{
				message: "/claude:handoff requires interactive TUI mode so the terminal can be handed to Claude Code.",
				level: "error",
			},
		]);
	});

	test("waits for idle and suspends the TUI around the Claude session", async () => {
		const result = await runClaudeHandoff("focus");

		result.pi.assertDone();
		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.tuiEvents).toEqual(["stop", "start", "requestRender(true)"]);
	});

	test.each([
		{ name: "git failure", branch: step("git", ["branch", "--show-current"], { code: 128, stderr: "fatal" }), message: /command failed/ },
		{ name: "detached HEAD", branch: step("git", ["branch", "--show-current"], { stdout: "\n" }), message: /detached HEAD/ },
	])("does not launch when branch lookup fails: $name", async ({ branch, message }) => {
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
		expect(context.tuiEvents).toEqual([]);
		expect(context.notifications[0]?.message).toMatch(message);
		expect(context.notifications[0]?.level).toBe("error");
	});

	test.each([
		{
			name: "command failure",
			list: step("handoff", ["list", "--branch", BRANCH, "--format", "json"], { code: 1, stderr: "boom" }),
			message: /command failed/,
		},
		{
			name: "invalid JSON",
			list: step("handoff", ["list", "--branch", BRANCH, "--format", "json"], { stdout: "not json" }),
			message: /Failed to parse handoff list JSON/,
		},
	])("does not launch when the before snapshot fails: $name", async ({ list, message }) => {
		const pi = new FakePi([branchStep(), list]);
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
		expect(context.tuiEvents).toEqual([]);
		expect(context.notifications[0]?.message).toMatch(message);
		expect(context.notifications[0]?.level).toBe("error");
	});

	test("reports spawn failure without taking an after snapshot", async () => {
		const result = await runClaudeHandoff(
			"focus",
			[branchStep(), listStep(BRANCH, [])],
			{ type: "spawn-failed", message: "spawn claude ENOENT" },
		);

		result.pi.assertDone();
		expect(result.pi.execCalls).toHaveLength(2);
		expect(result.tuiEvents).toEqual(["stop", "start", "requestRender(true)"]);
		expect(result.notifications).toEqual([
			{
				message: "Failed to launch Claude Code: spawn claude ENOENT. Is Claude Code installed and on PATH?",
				level: "error",
			},
		]);
	});

	test.each([
		{ name: "clean exit", outcome: { type: "exited" as const, code: 0, signal: null }, expected: "Claude exited without creating a new handoff." },
		{ name: "nonzero exit", outcome: { type: "exited" as const, code: 3, signal: null }, expected: "Claude exited without creating a new handoff (exit code 3)." },
		{ name: "signal", outcome: { type: "exited" as const, code: null, signal: "SIGKILL" }, expected: "Claude exited without creating a new handoff (signal SIGKILL)." },
	])("warns when Claude creates no new handoff after $name", async ({ outcome, expected }) => {
		const result = await runClaudeHandoff("focus", [branchStep(), listStep(BRANCH, ["old.md"]), listStep(BRANCH, ["old.md"])], outcome);

		result.pi.assertDone();
		expect(result.notifications).toContainEqual({ message: expected, level: "warning" });
	});

	test("reports one new handoff with preview and pickup hint", async () => {
		const artifact = "# Handoff\n\nContinuation focus: fix auth flow after review\n";
		const env = { PATH: "/bin", HOME: "/home/me", ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "token" };
		const result = await runClaudeHandoff(
			"fix auth flow",
			[branchStep(), listStep(BRANCH, []), listStep(BRANCH, ["fix-auth-flow.md"]), getStep(BRANCH, "fix-auth-flow.md", artifact)],
			{ type: "exited", code: 0, signal: null },
			env,
		);

		result.pi.assertDone();
		expect(result.notifications).toContainEqual({
			message: "Created handoff fix-auth-flow — fix auth flow after review. Pick up with /handoff:pickup fix-auth-flow.",
			level: "info",
		});
		expect(result.runClaude.invocations).toHaveLength(1);
		expect(result.runClaude.invocations[0]?.cwd).toBe(ROOT);
		expect(result.runClaude.invocations[0]?.prompt).toContain("handoff-create");
		expect(result.runClaude.invocations[0]?.prompt).toContain(`Store the handoff on branch ${BRANCH}`);
		expect(result.runClaude.invocations[0]?.prompt).toContain("```text\nfix auth flow\n```");
		expect(result.runClaude.invocations[0]?.env).toEqual({ PATH: "/bin", HOME: "/home/me" });
		expect(env).toEqual({ PATH: "/bin", HOME: "/home/me", ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "token" });
	});

	test("reports only multiple new handoffs", async () => {
		const result = await runClaudeHandoff(
			"focus",
			[
				branchStep(),
				listStep(BRANCH, ["old.md"]),
				listStep(BRANCH, ["old.md", "first-new.md", "second-new.md"]),
				getStep(BRANCH, "first-new.md", "Continuation focus: first new"),
				getStep(BRANCH, "second-new.md", "Continuation focus: second new"),
			],
		);

		result.pi.assertDone();
		expect(result.notifications).toEqual([
			{ message: "Created handoff first-new — first new. Pick up with /handoff:pickup first-new.", level: "info" },
			{ message: "Created handoff second-new — second new. Pick up with /handoff:pickup second-new.", level: "info" },
		]);
		expect(result.notifications.map((notification) => notification.message).join("\n")).not.toContain("old");
	});

	test("reports created handoff when preview is unreadable", async () => {
		const result = await runClaudeHandoff(
			"focus",
			[
				branchStep(),
				listStep(BRANCH, []),
				listStep(BRANCH, ["new.md"]),
				step("brmem", ["get", "new.md", "--namespace", "handoff", "--branch", BRANCH], { code: 1, stderr: "missing" }),
			],
		);

		result.pi.assertDone();
		expect(result.notifications).toEqual([
			{ message: "Created handoff new — (preview unreadable). Pick up with /handoff:pickup new.", level: "info" },
		]);
	});

	test("asks Claude to request focus when args are empty", () => {
		const prompt = buildClaudeSeedPrompt(BRANCH, "  ");

		expect(prompt).toContain("Ask the user for the continuation focus first");
		expect(prompt).not.toContain("```text");
	});

	test("reports after-list failure as unverified", async () => {
		const result = await runClaudeHandoff(
			"focus",
			[
				branchStep(),
				listStep(BRANCH, []),
				step("handoff", ["list", "--branch", BRANCH, "--format", "json"], { code: 1, stderr: "after failed" }),
			],
		);

		result.pi.assertDone();
		expect(result.notifications).toHaveLength(1);
		expect(result.notifications[0]?.level).toBe("error");
		expect(result.notifications[0]?.message).toContain("could not verify whether a handoff was created");
		expect(result.notifications[0]?.message).toContain("after failed");
	});

	test("pure helpers scrub env, build prompts, and diff additions only", () => {
		const env = { PATH: "/bin", ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "token", EMPTY: undefined };
		const scrubbed = scrubClaudeEnv(env);
		expect(scrubbed).toEqual({ PATH: "/bin", EMPTY: undefined });
		expect(env).toEqual({ PATH: "/bin", ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "token", EMPTY: undefined });

		const prompt = buildClaudeSeedPrompt(BRANCH, "continue work");
		expect(prompt).toContain("handoff-create");
		expect(prompt).toContain(BRANCH);
		expect(prompt).toContain("```text\ncontinue work\n```");

		const oldItem = item("old.md");
		const newItem = item("new.md");
		expect(diffNewHandoffItems([oldItem], [oldItem])).toEqual([]);
		expect(diffNewHandoffItems([oldItem, newItem], [oldItem])).toEqual([]);
		expect(diffNewHandoffItems([], [oldItem, newItem])).toEqual([oldItem, newItem]);
		expect(diffNewHandoffItems([oldItem], [oldItem, newItem])).toEqual([newItem]);
	});
});

function item(key: string): HandoffListItem {
	return { branch: BRANCH, key, slug: key.replace(/\.md$/, "") };
}

import { describe, expect, test } from "vitest";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import { createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";

import { createPiHandoffContext } from "../src/api-context.ts";
import { buildHandoffSelfPrompt, formatHandoffSelfKickoffPrompt } from "../src/extension.ts";
import { createHandoffSelfWorkflow } from "../src/self.ts";
import type { HandoffCreateSkillLoader } from "../src/create-skill.ts";
import {
	BRANCH,
	FakePi,
	branchStep,
	checkStep,
	createContext,
	getRegisteredCommand,
	step,
} from "./handoff-test-fakes.ts";

const FAKE_SKILL_PATH = "/repo/.agents/skills/handoff-create/SKILL.md";
const CREATE_COMMAND =
	"ns handoff create --branch feature/handoff --file /tmp/final-handoff.md --format json";
const FAKE_SKILL_BLOCK = `<skill name="handoff-create" location="${FAKE_SKILL_PATH}">
References are relative to /repo/.agents/skills/handoff-create.

# handoff-create

Create a handoff from the skill body.
</skill>`;

describe("ns:handoff:self extension", () => {
	test("observes one exact create result, verifies it after settlement, and replaces the session", async () => {
		const timers = createManualTimerScheduler();
		const pi = new FakePi([branchStep(), ...checkStep(BRANCH, "finish-widget.md", true)]);
		registerSelfOnly(pi, 30_000, timers.timers);
		const context = createContext({ sessionFile: "/sessions/current.jsonl" });
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);

		await emitCreate(pi, context.ctx);
		expect(context.newSessionCalls).toEqual([]);
		await settle(pi, context.ctx);
		await commandPromise;

		pi.assertDone();
		expect(context.waitForIdleCalls()).toBe(2);
		expect(context.newSessionCalls).toEqual([{ parentSession: "/sessions/current.jsonl" }]);
		expect(context.replacementNotifications).toEqual([
			{ message: `Picking up handoff finish-widget from branch ${BRANCH}…`, level: "info" },
		]);
		expect(context.replacementUserMessages).toEqual([
			{ content: formatHandoffSelfKickoffPrompt(BRANCH, "finish-widget"), options: undefined },
		]);
		expect(context.statuses).toEqual(["clearing context…"]);
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("waits for idle before preparation and again immediately before replacement", async () => {
		const pi = new FakePi([branchStep(), ...checkStep(BRANCH, "finish-widget.md", true)]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const lifecycle: string[] = [];
		const originalWaitForIdle = context.ctx.waitForIdle;
		const originalNewSession = context.ctx.newSession;
		context.ctx.waitForIdle = async () => {
			lifecycle.push("waitForIdle");
			await originalWaitForIdle();
		};
		context.ctx.newSession = async (options) => {
			lifecycle.push("newSession");
			return (await originalNewSession?.(options)) ?? { cancelled: false };
		};

		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx);
		await settle(pi, context.ctx);
		await commandPromise;

		expect(lifecycle).toEqual(["waitForIdle", "waitForIdle", "newSession"]);
		pi.assertDone();
	});

	test("uses no old session-bound context after replacement", async () => {
		const pi = new FakePi([branchStep(), ...checkStep(BRANCH, "finish-widget.md", true)]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const originalNewSession = context.ctx.newSession;
		let stale = false;
		context.ctx.newSession = async (options) => {
			const result = await originalNewSession?.(options);
			stale = true;
			return result ?? { cancelled: false };
		};
		context.ctx.ui.notify = (message, level) => {
			if (stale) throw new Error("old command context used after replacement");
			context.notifications.push({ message, level });
		};

		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx);
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.replacementUserMessages).toHaveLength(1);
	});

	test.each([
		{
			name: "no create result",
			emit: async (_pi: FakePi, _ctx: ReturnType<typeof createContext>["ctx"]) => {},
			message: "No valid Handoff create result was observed",
		},
		{
			name: "malformed result",
			emit: async (pi: FakePi, ctx: ReturnType<typeof createContext>["ctx"]) =>
				emitCreate(pi, ctx, { text: "not json" }),
			message: "malformed structured output",
		},
		{
			name: "nonzero bash",
			emit: async (pi: FakePi, ctx: ReturnType<typeof createContext>["ctx"]) =>
				emitCreate(pi, ctx, { isError: true }),
			message: "did not complete successfully",
		},
		{
			name: "truncated output",
			emit: async (pi: FakePi, ctx: ReturnType<typeof createContext>["ctx"]) =>
				emitCreate(pi, ctx, { truncated: true }),
			message: "unavailable or truncated",
		},
		{
			name: "wrong branch",
			emit: async (pi: FakePi, ctx: ReturnType<typeof createContext>["ctx"]) =>
				emitCreate(pi, ctx, { branch: "other/branch" }),
			message: "not the active workflow branch",
		},
		{
			name: "wrong cwd",
			emit: async (pi: FakePi, ctx: ReturnType<typeof createContext>["ctx"]) =>
				emitCreate(pi, ctx, { endContext: createContext({ cwd: "/other/repo" }).ctx }),
			message: "active workflow cwd",
		},
	])("$name preserves the current session", async ({ emit, message }) => {
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);

		await emit(pi, context.ctx);
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain(message);
		pi.assertDone();
	});

	test("command start and end events must correlate by tool call id", async () => {
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);

		await pi.emit(
			"tool_execution_start",
			{ toolCallId: "create-start", toolName: "bash", args: { command: CREATE_COMMAND } },
			context.ctx,
		);
		await pi.emit(
			"tool_execution_end",
			{
				toolCallId: "other-end",
				toolName: "bash",
				isError: false,
				result: createToolResult(),
			},
			context.ctx,
		);
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("No valid Handoff create result");
		pi.assertDone();
	});

	test.each([
		"ns handoff create --file /tmp/final-handoff.md --format json",
		`${CREATE_COMMAND} && echo chained`,
		`${CREATE_COMMAND} > /tmp/result.json`,
		"ns handoff create --branch feature/handoff --file /tmp/final-handoff.md --format json --format json",
	])("non-standalone or inexact create command is ignored: %s", async (command) => {
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx, { command });
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("No valid Handoff create result");
		pi.assertDone();
	});

	test("create command branch must match the active workflow branch", async () => {
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx, {
			command: "ns handoff create --branch other/branch --file /tmp/final-handoff.md --format json",
		});
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain(
			"targeted branch other/branch, not the active workflow branch",
		);
		pi.assertDone();
	});

	test("one valid and one invalid create result is ambiguous and preserves context", async () => {
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx, { toolCallId: "create-1" });
		await emitCreate(pi, context.ctx, { toolCallId: "create-2", text: "not json" });
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("malformed structured output");
		pi.assertDone();
	});

	test("duplicate successful create results are ambiguous and preserve context", async () => {
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);

		await emitCreate(pi, context.ctx, { toolCallId: "create-1" });
		await emitCreate(pi, context.ctx, { toolCallId: "create-2" });
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("Multiple successful");
		pi.assertDone();
	});

	test("unrelated Bash and create commands outside the active workflow are ignored", async () => {
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		await emitCreate(pi, context.ctx);
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx, { command: "git status --short" });
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("No valid Handoff create result");
		pi.assertDone();
	});

	test("result key must independently match the exact branch/slug verification target", async () => {
		const pi = new FakePi([branchStep(), ...checkStep(BRANCH, "finish-widget.md", true)]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx, {
			text: JSON.stringify({
				status: "ok",
				exitCode: 0,
				data: { ...createEvidence(BRANCH), key: "different.md" },
			}),
		});
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain(
			"not found at the exact observed branch and key",
		);
		pi.assertDone();
	});

	test("missing independently verified artifact preserves context", async () => {
		const pi = new FakePi([branchStep(), ...checkStep(BRANCH, "finish-widget.md", false)]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx);
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain(
			"not found at the exact observed branch and key",
		);
		pi.assertDone();
	});

	test("domain verification failure preserves context", async () => {
		const pi = new FakePi([
			branchStep(),
			step("git", ["check-ref-format", "--branch", BRANCH], {
				code: 1,
				stderr: "invalid ref",
			}),
		]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx);
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("Handoff verification failed");
		pi.assertDone();
	});

	test.each([
		{
			name: "wrong envelope exit code",
			value: { status: "ok", exitCode: 1, data: createEvidence(BRANCH) },
		},
		{
			name: "failure envelope",
			value: { status: "error", exitCode: 1, error: { code: "failed", message: "nope" } },
		},
		{
			name: "missing create field",
			value: { status: "ok", exitCode: 0, data: { ...createEvidence(BRANCH), commit: undefined } },
		},
	])("$name is rejected by the exact create schema", async ({ value }) => {
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx, { text: JSON.stringify(value) });
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("malformed structured output");
		pi.assertDone();
	});

	test("timeout prevents stale settlement from replacing the session", async () => {
		const timers = createManualTimerScheduler();
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 1, timers.timers);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		timers.advanceMs(1);
		await commandPromise;
		await emitCreate(pi, context.ctx);
		await settle(pi, context.ctx);

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("timed out");
		expect(timers.pendingTimerCount()).toBe(0);
		pi.assertDone();
	});

	test("duplicate settlement while verification is in flight verifies and replaces only once", async () => {
		const verification = deferred<{ stdout: string }>();
		const checked = checkStep(BRANCH, "finish-widget.md", true);
		const pi = new FakePi([
			branchStep(),
			step("git", ["check-ref-format", "--branch", BRANCH], verification.promise),
			...checked.slice(1),
		]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx);
		const firstSettlement = settle(pi, context.ctx);
		await waitForExecCalls(pi, 2);
		await settle(pi, context.ctx);
		verification.resolve({ stdout: `${BRANCH}\n` });
		await firstSettlement;
		await commandPromise;

		expect(context.newSessionCalls).toHaveLength(1);
		expect(context.replacementUserMessages).toHaveLength(1);
		pi.assertDone();
	});

	test("timeout wins safely against in-flight asynchronous verification", async () => {
		const timers = createManualTimerScheduler();
		const verification = deferred<{ stdout: string }>();
		const checked = checkStep(BRANCH, "finish-widget.md", true);
		const pi = new FakePi([
			branchStep(),
			step("git", ["check-ref-format", "--branch", BRANCH], verification.promise),
			...checked.slice(1),
		]);
		registerSelfOnly(pi, 1, timers.timers);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx);
		const settling = settle(pi, context.ctx);
		await waitForExecCalls(pi, 2);
		timers.advanceMs(1);
		await commandPromise;
		verification.resolve({ stdout: `${BRANCH}\n` });
		await settling;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("timed out");
		expect(timers.pendingTimerCount()).toBe(0);
		pi.assertDone();
	});

	test("session shutdown wins safely against in-flight asynchronous verification", async () => {
		const verification = deferred<{ stdout: string }>();
		const checked = checkStep(BRANCH, "finish-widget.md", true);
		const pi = new FakePi([
			branchStep(),
			step("git", ["check-ref-format", "--branch", BRANCH], verification.promise),
			...checked.slice(1),
		]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx);
		const settling = settle(pi, context.ctx);
		await waitForExecCalls(pi, 2);
		await pi.emit("session_shutdown", { type: "session_shutdown", reason: "quit" }, context.ctx);
		await commandPromise;
		verification.resolve({ stdout: `${BRANCH}\n` });
		await settling;

		expect(context.newSessionCalls).toEqual([]);
		pi.assertDone();
	});

	test("session shutdown cancels the observer and preserves context", async () => {
		const timers = createManualTimerScheduler();
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000, timers.timers);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await pi.emit("session_shutdown", { type: "session_shutdown", reason: "quit" }, context.ctx);
		await commandPromise;
		await emitCreate(pi, context.ctx);
		await settle(pi, context.ctx);

		expect(context.newSessionCalls).toEqual([]);
		expect(timers.pendingTimerCount()).toBe(0);
		pi.assertDone();
	});

	test("an aborted run settles without evidence and preserves context", async () => {
		const pi = new FakePi([branchStep()]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);

		// Pi has no distinct abort event; an aborted run terminates with agent_settled.
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.newSessionCalls).toEqual([]);
		expect(context.notifications.at(-1)?.message).toContain("No valid Handoff create result");
		pi.assertDone();
	});

	test("concurrent invocation is rejected while a workflow is active", async () => {
		const pi = new FakePi([branchStep(), ...checkStep(BRANCH, "finish-widget.md", true)]);
		registerSelfOnly(pi, 30_000);
		const context = createContext();
		const first = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await getRegisteredCommand(pi, "ns:handoff:self").handler("second", context.ctx);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(context.notifications.some(({ message }) => message.includes("already active"))).toBe(
			true,
		);
		await emitCreate(pi, context.ctx);
		await settle(pi, context.ctx);
		await first;
		pi.assertDone();
	});

	test.each([
		{
			name: "replacement cancellation",
			options: { isNewSessionCancelled: true },
			level: "warning",
		},
		{
			name: "replacement exception",
			options: { newSessionError: new Error("boom") },
			level: "error",
		},
	])("$name reports manual recovery and preserves old context", async ({ options, level }) => {
		const pi = new FakePi([branchStep(), ...checkStep(BRANCH, "finish-widget.md", true)]);
		registerSelfOnly(pi, 30_000);
		const context = createContext(options);
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx);
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.replacementUserMessages).toEqual([]);
		expect(context.notifications.at(-1)?.level).toBe(level);
		expect(context.notifications.at(-1)?.message).toContain("Context was not cleared");
		expect(context.notifications.at(-1)?.message).toContain(
			formatHandoffSelfKickoffPrompt(BRANCH, "finish-widget"),
		);
		pi.assertDone();
	});

	test("session replacement capability is checked on each command context", async () => {
		const pi = new FakePi([]);
		registerSelfOnly(pi, 30_000);
		const context = createContext({ hasNewSession: false });
		await startSelf(pi, context.ctx);

		expect(context.notifications.at(-1)?.message).toContain(
			"requires Pi session replacement support",
		);
		expect(pi.sentUserMessages).toEqual([]);
		pi.assertDone();
	});

	test("pickup send failure is reported only through the fresh replacement context", async () => {
		const pi = new FakePi([branchStep(), ...checkStep(BRANCH, "finish-widget.md", true)]);
		registerSelfOnly(pi, 30_000);
		const context = createContext({ replacementSendError: new Error("fresh send failed") });
		const commandPromise = startSelf(pi, context.ctx);
		await waitForPrompt(pi);
		await emitCreate(pi, context.ctx);
		await settle(pi, context.ctx);
		await commandPromise;

		expect(context.replacementUserMessages).toEqual([]);
		expect(context.replacementNotifications.at(-1)?.message).toContain("fresh send failed");
		expect(context.replacementNotifications.at(-1)?.message).toContain(
			formatHandoffSelfKickoffPrompt(BRANCH, "finish-widget"),
		);
		expect(context.notifications.at(-1)?.message).not.toContain("fresh send failed");
		pi.assertDone();
	});

	test("command is available without custom-tool registration support", () => {
		const pi = new FakePi([], { registerTool: false });
		registerSelfOnly(pi, 30_000);
		expect(getRegisteredCommand(pi, "ns:handoff:self")).toBeDefined();
		expect(pi.toolRegistrationNames).toEqual([]);
	});
});

describe("ns:handoff:self prompt", () => {
	test("requires one standalone structured create and exposes no internal identity", () => {
		const prompt = buildHandoffSelfPrompt({
			skillBlock: "# handoff-create skill",
			request: { focus: "make a fresh session", branch: BRANCH },
			investigationSources: {},
		});
		expect(prompt).toContain("standalone `ns handoff create` command");
		expect(prompt).toContain("do not chain another command or redirect its structured output");
		expect(prompt).toContain("The command owns session replacement");
		expect(prompt).not.toContain("opaque workflow");
		expect(prompt).not.toContain("queue pickup tool");
		expect(prompt).toContain(formatHandoffSelfKickoffPrompt(BRANCH, "<returned-slug>"));
	});
});

function registerSelfOnly(pi: FakePi, timeoutMs: number, timers?: TimerScheduler): void {
	const commands = createPiCommandExecApi(pi);
	const workflow = createHandoffSelfWorkflow(pi, {
		git: createPiHandoffContext(commands).git,
		commands,
		timeoutMs,
		...(timers === undefined ? {} : { timers }),
		skillLoader: fakeHandoffCreateSkillLoader(),
	});
	pi.registerCommand("ns:handoff:self", {
		description: "Create a handoff, clear context, and pick it up in this Pi session.",
		handler: async (args, ctx) => workflow.handleCommand(args, ctx),
	});
}

function startSelf(pi: FakePi, ctx: ReturnType<typeof createContext>["ctx"]): Promise<void> {
	return Promise.resolve(getRegisteredCommand(pi, "ns:handoff:self").handler("finish widget", ctx));
}

async function waitForPrompt(pi: FakePi): Promise<void> {
	for (let attempt = 0; attempt < 100 && pi.sentUserMessages.length === 0; attempt += 1) {
		await Promise.resolve();
	}
	if (pi.sentUserMessages.length === 0) throw new Error("self-handoff prompt was not sent");
}

async function emitCreate(
	pi: FakePi,
	ctx: ReturnType<typeof createContext>["ctx"],
	options: {
		toolCallId?: string;
		command?: string;
		text?: string;
		isError?: boolean;
		truncated?: boolean;
		branch?: string;
		endContext?: ReturnType<typeof createContext>["ctx"];
	} = {},
): Promise<void> {
	const toolCallId = options.toolCallId ?? "create-1";
	await pi.emit(
		"tool_execution_start",
		{ toolCallId, toolName: "bash", args: { command: options.command ?? CREATE_COMMAND } },
		ctx,
	);
	await pi.emit(
		"tool_execution_end",
		{
			toolCallId,
			toolName: "bash",
			isError: options.isError ?? false,
			result: createToolResult({
				...(options.text === undefined ? {} : { text: options.text }),
				...(options.truncated === undefined ? {} : { truncated: options.truncated }),
				...(options.branch === undefined ? {} : { branch: options.branch }),
			}),
		},
		options.endContext ?? ctx,
	);
}

async function settle(pi: FakePi, ctx: ReturnType<typeof createContext>["ctx"]): Promise<void> {
	await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
}

function createToolResult(options: { text?: string; truncated?: boolean; branch?: string } = {}) {
	return {
		content: [
			{
				type: "text",
				text:
					options.text ??
					JSON.stringify({
						status: "ok",
						exitCode: 0,
						data: createEvidence(options.branch ?? BRANCH),
					}),
			},
		],
		details: options.truncated === true ? { truncation: { truncated: true } } : undefined,
	};
}

async function waitForExecCalls(pi: FakePi, count: number): Promise<void> {
	for (let attempt = 0; attempt < 100 && pi.execCalls.length < count; attempt += 1) {
		await Promise.resolve();
	}
	if (pi.execCalls.length < count) throw new Error(`expected ${count} exec calls`);
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
	let resolvePromise: ((value: T) => void) | undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve(value) {
			if (resolvePromise === undefined) throw new Error("deferred promise was not initialized");
			resolvePromise(value);
		},
	};
}

function createEvidence(branch: string) {
	return {
		namespace: "handoff",
		branch,
		slug: "finish-widget",
		key: "finish-widget.md",
		entryLocator: `refs/brmem/ns/handoff/${branch}:finish-widget.md`,
		commit: "commit-sha",
		sourceFile: "/tmp/final-handoff.md",
		slugSource: "content-derived",
		provider: "openai-codex",
		model: "gpt-5.6-luna",
	};
}

function fakeHandoffCreateSkillLoader(): HandoffCreateSkillLoader {
	return {
		captureSkill() {
			return {
				name: "handoff-create",
				filePath: FAKE_SKILL_PATH,
				baseDir: "/repo/.agents/skills/handoff-create",
				async load() {
					return {
						name: "handoff-create",
						path: FAKE_SKILL_PATH,
						baseDir: "/repo/.agents/skills/handoff-create",
						body: "# handoff-create\n\nCreate a handoff from the skill body.",
						block: FAKE_SKILL_BLOCK,
					};
				},
			};
		},
	};
}

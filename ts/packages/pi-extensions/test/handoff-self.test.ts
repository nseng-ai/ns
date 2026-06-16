import { describe, expect, test, vi } from "vitest";

import handoffExtension, { buildHandoffSelfPrompt, formatHandoffSelfKickoffPrompt } from "../src/handoff.ts";
import { createHandoffSelfWorkflow } from "../src/handoff/self.ts";
import {
	BRANCH,
	FakePi,
	branchStep,
	checkStep,
	createContext,
	getRegisteredCommand,
	getRegisteredTool,
	skillCommandInfo,
	withTempSkill,
} from "./handoff-test-fakes.ts";

const SELF_TOOL_NAME = "handoff_self_queue_pickup";

describe("handoff:self extension", () => {
	test("handoff:self command sends create prompt with command-owned rendezvous instructions", async () => {
		await withTempSkill(async (skillPath, repoDir) => {
			const pi = new FakePi([branchStep(), checkStep(BRANCH, "finish-widget.md", true)], [skillCommandInfo(skillPath)]);
			handoffExtension(pi);
			const command = getRegisteredCommand(pi, "handoff:self");
			const tool = getRegisteredTool(pi, SELF_TOOL_NAME);
			const context = createContext({ cwd: repoDir });

			const commandPromise = Promise.resolve(command.handler("finish the self handoff workflow", context.ctx));
			await waitForSentUserMessage(pi);

			expect(context.waitForIdleCalls()).toBe(1);
			expect(pi.execCalls.map((call) => [call.command, call.args])).toEqual([["git", ["branch", "--show-current"]]]);
			expect(context.notifications).toEqual([{ message: "Starting handoff:self workflow with content-derived slug…", level: "info" }]);
			expect(pi.sentUserMessages).toHaveLength(1);
			const prompt = pi.sentUserMessages[0] ?? "";
			const workflowId = extractWorkflowId(prompt);
			expect(prompt).toContain(`<skill name="handoff-create" location="${skillPath}">`);
			expect(prompt).toContain("This is a /handoff:self request.");
			expect(prompt).toContain("finish the self handoff workflow");
			expect(prompt).toContain(`- Branch: ${BRANCH}`);
			expect(prompt).toContain("derive_handoff_slug_from_content");
			expect(prompt).toContain(`workflow_id: ${workflowId}`);
			expect(prompt).toContain("After `brmem put` succeeds, call handoff_self_queue_pickup");
			expect(prompt).toContain("do not clear context or pick up the handoff");
			expect(prompt).toContain("Do not queue slash commands such as /handoff:self-resume, /handoff:self-pickup, or /new as user messages.");
			expect(prompt).toContain("After saving and verification, the command will replace this session");
			expect(prompt).not.toContain(`/handoff:pickup --branch ${BRANCH} <returned-slug>`);
			expect(prompt).toContain(formatHandoffSelfKickoffPrompt(BRANCH, "<returned-slug>"));

			await tool.execute("tool-call-1", { branch: BRANCH, slug: "finish-widget", workflow_id: workflowId }, undefined, undefined, context.ctx);
			await commandPromise;
			pi.assertDone();
		});
	});

	test("handoff:self waits for verified tool result, terminates the old turn, then replaces the session", async () => {
		const pi = new FakePi([branchStep(), checkStep(BRANCH, "finish-widget.md", true)]);
		handoffExtension(pi);
		const command = getRegisteredCommand(pi, "handoff:self");
		const tool = getRegisteredTool(pi, SELF_TOOL_NAME);
		const context = createContext({ sessionFile: "/sessions/current.jsonl" });
		const originalNewSession = context.ctx.newSession;
		let isOldContextStale = false;
		context.ctx.newSession = async (options) => {
			const result = await originalNewSession?.(options);
			isOldContextStale = true;
			return result ?? { cancelled: false };
		};
		context.ctx.ui.notify = (message, level) => {
			if (isOldContextStale) {
				throw new Error("old command context notify used after newSession");
			}
			context.notifications.push({ message, level });
		};
		context.ctx.ui.setStatus = (_key, value) => {
			if (isOldContextStale) {
				throw new Error("old command context status used after newSession");
			}
			context.statuses.push(value);
		};
		const secondIdleGate = createDeferred<void>();
		let waitForIdleCalls = 0;
		context.ctx.waitForIdle = async (): Promise<void> => {
			waitForIdleCalls += 1;
			if (waitForIdleCalls === 2) {
				await secondIdleGate.promise;
			}
		};

		const commandPromise = Promise.resolve(command.handler("finish widget", context.ctx));
		await waitForSentUserMessage(pi);
		const workflowId = extractWorkflowId(pi.sentUserMessages[0] ?? "");

		expect(context.newSessionCalls).toEqual([]);
		const result = await tool.execute("tool-call-1", { branch: BRANCH, slug: "finish-widget", workflow_id: workflowId }, undefined, undefined, context.ctx);

		expect(result.isError).toBeUndefined();
		expect(result.terminate).toBe(true);
		expect(result.content[0]?.text).toContain("Verified handoff:self artifact finish-widget");
		expect(result.details).toEqual({
			type: "self-handoff-ready",
			branch: BRANCH,
			slug: "finish-widget",
			workflowId,
			pickupPrompt: formatHandoffSelfKickoffPrompt(BRANCH, "finish-widget"),
		});
		expect(pi.sentUserMessageCalls).toHaveLength(1);
		await waitForCondition(() => waitForIdleCalls === 2);
		expect(context.newSessionCalls).toEqual([]);

		secondIdleGate.resolve();
		await commandPromise;
		pi.assertDone();
		expect(waitForIdleCalls).toBe(2);
		expect(context.newSessionCalls).toEqual([{ parentSession: "/sessions/current.jsonl" }]);
		expect(context.replacementNotifications).toEqual([
			{ message: `Picking up handoff finish-widget from branch ${BRANCH}…`, level: "info" },
		]);
		expect(context.replacementUserMessages).toEqual([
			{ content: formatHandoffSelfKickoffPrompt(BRANCH, "finish-widget"), options: undefined },
		]);
		expect(context.statuses).toEqual(["verifying saved handoff…", undefined, "clearing context…"]);
	});

	test("handoff_self_queue_pickup fails closed when no workflow is active", async () => {
		const pi = new FakePi();
		handoffExtension(pi);
		const tool = getRegisteredTool(pi, SELF_TOOL_NAME);
		const context = createContext();

		const result = await tool.execute("tool-call-1", { branch: BRANCH, slug: "finish-widget", workflow_id: "not-active" }, undefined, undefined, context.ctx);

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("no active /handoff:self workflow");
		expect(context.newSessionCalls).toEqual([]);
		expect(pi.execCalls).toEqual([]);
	});

	test("handoff_self_queue_pickup fails closed for wrong workflow id and does not clear context", async () => {
		vi.useFakeTimers();
		try {
			const pi = new FakePi([branchStep()]);
			registerSelfOnly(pi, 1);
			const command = getRegisteredCommand(pi, "handoff:self");
			const tool = getRegisteredTool(pi, SELF_TOOL_NAME);
			const context = createContext();

			const commandPromise = Promise.resolve(command.handler("finish widget", context.ctx));
			await waitForSentUserMessageWithFakeTimers(pi);
			const result = await tool.execute("tool-call-1", { branch: BRANCH, slug: "finish-widget", workflow_id: "wrong" }, undefined, undefined, context.ctx);

			expect(result.isError).toBe(true);
			expect(result.content[0]?.text).toContain("wrong workflow_id");
			expect(context.newSessionCalls).toEqual([]);
			expect(pi.execCalls.map((call) => call.command)).toEqual(["git"]);

			await vi.advanceTimersByTimeAsync(1);
			await commandPromise;
		} finally {
			vi.useRealTimers();
		}
	});

	test("missing handoff does not resolve the workflow or clear context", async () => {
		vi.useFakeTimers();
		try {
			const pi = new FakePi([branchStep(), checkStep(BRANCH, "missing.md", false)]);
			registerSelfOnly(pi, 1);
			const command = getRegisteredCommand(pi, "handoff:self");
			const tool = getRegisteredTool(pi, SELF_TOOL_NAME);
			const context = createContext();

			const commandPromise = Promise.resolve(command.handler("finish widget", context.ctx));
			await waitForSentUserMessageWithFakeTimers(pi);
			const workflowId = extractWorkflowId(pi.sentUserMessages[0] ?? "");
			const result = await tool.execute("tool-call-1", { branch: BRANCH, slug: "missing", workflow_id: workflowId }, undefined, undefined, context.ctx);

			expect(result.isError).toBe(true);
			expect(result.content[0]?.text).toBe(`No handoff missing found on branch ${BRANCH}; context was not cleared.`);
			expect(context.newSessionCalls).toEqual([]);

			await vi.advanceTimersByTimeAsync(1);
			await commandPromise;
			expect(context.newSessionCalls).toEqual([]);
			pi.assertDone();
		} finally {
			vi.useRealTimers();
		}
	});

	test("timeout clears the active workflow and later tool calls cannot clear context", async () => {
		vi.useFakeTimers();
		try {
			const pi = new FakePi([branchStep()]);
			registerSelfOnly(pi, 1);
			const command = getRegisteredCommand(pi, "handoff:self");
			const tool = getRegisteredTool(pi, SELF_TOOL_NAME);
			const context = createContext();

			const commandPromise = Promise.resolve(command.handler("finish widget", context.ctx));
			await waitForSentUserMessageWithFakeTimers(pi);
			const workflowId = extractWorkflowId(pi.sentUserMessages[0] ?? "");
			await vi.advanceTimersByTimeAsync(1);
			await commandPromise;

			expect(context.newSessionCalls).toEqual([]);
			expect(context.notifications.at(-1)).toEqual({
				message: "handoff:self timed out waiting for handoff_self_queue_pickup; context was not cleared because the saved handoff was not verified.",
				level: "error",
			});

			const lateResult = await tool.execute("tool-call-1", { branch: BRANCH, slug: "finish-widget", workflow_id: workflowId }, undefined, undefined, context.ctx);
			expect(lateResult.isError).toBe(true);
			expect(lateResult.content[0]?.text).toContain("no active /handoff:self workflow");
			expect(context.newSessionCalls).toEqual([]);
			pi.assertDone();
		} finally {
			vi.useRealTimers();
		}
	});

	test("concurrent handoff:self invocation is rejected while one workflow is active", async () => {
		const pi = new FakePi([branchStep(), checkStep(BRANCH, "finish-widget.md", true)]);
		handoffExtension(pi);
		const command = getRegisteredCommand(pi, "handoff:self");
		const tool = getRegisteredTool(pi, SELF_TOOL_NAME);
		const context = createContext();

		const firstPromise = Promise.resolve(command.handler("first focus", context.ctx));
		await waitForSentUserMessage(pi);
		await command.handler("second focus", context.ctx);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(context.notifications.some((notification) => notification.message.includes("already waiting"))).toBe(true);

		const workflowId = extractWorkflowId(pi.sentUserMessages[0] ?? "");
		await tool.execute("tool-call-1", { branch: BRANCH, slug: "finish-widget", workflow_id: workflowId }, undefined, undefined, context.ctx);
		await firstPromise;
		pi.assertDone();
	});
});

describe("handoff:self pure helpers", () => {
	test("handoff:self prompt requires launch tool ordering and command-owned session replacement wording", () => {
		const prompt = buildHandoffSelfPrompt({
			skillBlock: "# handoff-create skill",
			request: { focus: "make a fresh session", branch: BRANCH },
		});

		expect(prompt).toContain("# handoff-create skill");
		expect(prompt).toContain("This is a /handoff:self request.");
		expect(prompt).toContain("workflow_id: <workflow-id>");
		expect(prompt).toContain("If it exists, stop; do not overwrite and do not clear context or pick up the handoff.");
		expect(prompt).toContain("After `brmem put` succeeds, call handoff_self_queue_pickup");
		expect(prompt).toContain("Do not queue slash commands such as /handoff:self-resume, /handoff:self-pickup, or /new as user messages.");
		expect(prompt).toContain("After saving and verification, the command will replace this session");
		expect(prompt).toContain(formatHandoffSelfKickoffPrompt(BRANCH, "<returned-slug>"));
		expect(prompt).not.toContain(`/handoff:pickup --branch ${BRANCH} <returned-slug>`);
	});
});

function registerSelfOnly(pi: FakePi, timeoutMs: number): void {
	const workflow = createHandoffSelfWorkflow(pi, { timeoutMs });
	pi.registerTool(workflow.buildTool());
	pi.registerCommand("handoff:self", {
		description: "Create a handoff, clear context, and pick it up in this Pi session.",
		handler: async (args, ctx) => workflow.handleCommand(args, ctx),
	});
}

async function waitForSentUserMessage(pi: FakePi): Promise<void> {
	await waitForCondition(() => pi.sentUserMessages.length > 0);
}

async function waitForCondition(condition: () => boolean): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (Date.now() < deadline) {
		if (condition()) {
			return;
		}
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 1);
		});
	}
	throw new Error("timed out waiting for condition");
}

async function waitForSentUserMessageWithFakeTimers(pi: FakePi): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (pi.sentUserMessages.length > 0) {
			return;
		}
		await vi.advanceTimersByTimeAsync(0);
	}
	throw new Error("timed out waiting for sent user message");
}

function extractWorkflowId(prompt: string): string {
	const match = /^- workflow_id: (.+)$/m.exec(prompt);
	if (match?.[1] === undefined) {
		throw new Error(`prompt did not contain workflow_id:\n${prompt}`);
	}
	return match[1].trim();
}

function createDeferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

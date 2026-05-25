import { describe, expect, test } from "bun:test";

import runnerSubagentDemoExtension, {
	RUNNER_SUBAGENT_DEMO_COMMAND_NAME,
	RUNNER_SUBAGENT_DEMO_MESSAGE_TYPE,
	buildRunnerSubagentDemoPrompt,
	type CustomMessage,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type MessageRenderer,
	type NotifyLevel,
} from "../src/runner-subagent-demo.ts";
import { RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES } from "../src/runner-subagent.ts";
import type { RunnerSubagentDispatcherDependencies } from "../src/runner-subagent/subagent-process.ts";
import type { RuntimeResultV1 } from "../src/runner-subagent/subagent-runtime.ts";
import { createFakeRunnerSubagentDispatcher, waitForSpawn } from "./runner-subagent-fakes.ts";

const ROOT = "/repo";
const SESSION_FILE = "/tmp/demo-runner-subagent.jsonl";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type SentMessage = CustomMessage & {
	options?: Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[1];
};

type Notification = {
	message: string;
	level: NotifyLevel | undefined;
};

type StatusUpdate = {
	key: string;
	value: string | undefined;
};

type WidgetUpdate = {
	key: string;
	value: string[] | undefined;
	options: { placement?: "aboveEditor" | "belowEditor" } | undefined;
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly messages: SentMessage[] = [];
	readonly sentUserMessages: string[] = [];
	[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	[key: string]: unknown;

	constructor(dependencies?: RunnerSubagentDispatcherDependencies) {
		if (dependencies) {
			this[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES] = dependencies;
		}
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.messageRenderers.set(customType, renderer);
	}

	sendMessage(message: CustomMessage, options?: SentMessage["options"]): void {
		this.messages.push({ ...message, options });
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

function createContext(options: { hasUI?: boolean } = {}): {
	ctx: ExtensionCommandContext;
	notifications: Notification[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const statuses: StatusUpdate[] = [];
	const widgets: WidgetUpdate[] = [];
	let waits = 0;

	const ctx: ExtensionCommandContext = {
		cwd: ROOT,
		hasUI: options.hasUI ?? true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			setStatus(key: string, value: string | undefined): void {
				statuses.push({ key, value });
			},
			setWidget(key: string, value: string[] | undefined, widgetOptions?: { placement?: "aboveEditor" | "belowEditor" }): void {
				widgets.push({ key, value, options: widgetOptions });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, statuses, widgets, waitForIdleCalls: () => waits };
}

async function runRunnerSubagentDemo(
	args: string,
	runtimeResult: RuntimeResultV1 | undefined,
	options: { hasUI?: boolean } = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
	messages: SentMessage[];
	spawnArgs: string[];
}> {
	const runner = createFakeRunnerSubagentDispatcher(
		runtimeResult === undefined ? { sessionFile: SESSION_FILE } : { sessionFile: SESSION_FILE, runtimeResult },
	);
	const pi = new FakePi(runner.dependencies);
	runnerSubagentDemoExtension(pi);
	const command = pi.commands.get(RUNNER_SUBAGENT_DEMO_COMMAND_NAME);
	expect(command).toBeDefined();
	const context = createContext(options);
	const running = Promise.resolve(command?.handler(args, context.ctx));
	const call = await waitForSpawn(runner.calls);
	call.process.close(0);
	await running;

	return { pi, messages: pi.messages, spawnArgs: call.args, ...context };
}

function messageText(message: SentMessage): string {
	if (typeof message.content === "string") return message.content;
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

describe("runner-subagent-demo extension", () => {
	test("registers /runner-subagent-demo and the custom message renderer", () => {
		const pi = new FakePi();
		runnerSubagentDemoExtension(pi);

		expect(pi.commands.get(RUNNER_SUBAGENT_DEMO_COMMAND_NAME)?.description).toContain("runner subagent Pi");
		expect(pi.messageRenderers.has(RUNNER_SUBAGENT_DEMO_MESSAGE_TYPE)).toBe(true);

		const renderer = pi.messageRenderers.get(RUNNER_SUBAGENT_DEMO_MESSAGE_TYPE);
		expect(renderer).toBeDefined();
		const component = renderer?.(
			{ customType: RUNNER_SUBAGENT_DEMO_MESSAGE_TYPE, content: "✓ ok\nSession file: /tmp/session.jsonl", display: true },
			{ expanded: false },
			{ fg: (color, text) => `${color}:${text}` },
		);
		expect(component?.render(80)).toEqual(["success:✓ ok", "accent:Session file: /tmp/session.jsonl"]);

		const arrayContentComponent = renderer?.(
			{
				customType: RUNNER_SUBAGENT_DEMO_MESSAGE_TYPE,
				content: [
					{ type: "text", text: "✓ ok" },
					{ type: "image", text: "ignored" },
					{ type: "text", text: "Session file: /tmp/session.jsonl" },
				],
				display: true,
			},
			{ expanded: false },
			{ fg: (color, text) => `${color}:${text}` },
		);
		expect(arrayContentComponent?.render(80)).toEqual(["success:✓ ok", "accent:Session file: /tmp/session.jsonl"]);
	});

	test("empty args show usage and do not start a runner subagent", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const pi = new FakePi(runner.dependencies);
		runnerSubagentDemoExtension(pi);
		const command = pi.commands.get(RUNNER_SUBAGENT_DEMO_COMMAND_NAME);
		const context = createContext();

		await command?.handler("   ", context.ctx);

		expect(context.notifications).toEqual([
			{ message: expect.stringContaining("Usage: /runner-subagent-demo <task>"), level: "info" },
		]);
		expect(context.waitForIdleCalls()).toBe(0);
		expect(runner.calls).toEqual([]);
		expect(pi.messages).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
	});

	test("completed runner subagent result sends summary, evidence, and session file", async () => {
		const result = await runRunnerSubagentDemo("Summarize the test fixture", {
			version: 1,
			kind: "terminal-capture",
			toolName: "runner_subagent_demo_complete",
			toolCallId: "tool-1",
			status: "completed",
			input: { summary: "Fixture summarized", evidence: ["read README", "checked tests"] },
		});

		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.pi.messages).toHaveLength(1);
		expect(result.pi.messages[0]?.customType).toBe(RUNNER_SUBAGENT_DEMO_MESSAGE_TYPE);
		const text = messageText(result.pi.messages[0]!);
		expect(text).toContain("✓ Runner subagent completed: Fixture summarized");
		expect(text).toContain("- read README");
		expect(text).toContain(`Session file: ${SESSION_FILE}`);
		expect(result.spawnArgs.at(-1)).toContain("Summarize the test fixture");
		expect(result.spawnArgs.at(-1)).toContain("exactly one terminal tool");
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("blocked runner subagent result sends blocker details and session file", async () => {
		const result = await runRunnerSubagentDemo("Find the missing dependency", {
			version: 1,
			kind: "terminal-capture",
			toolName: "runner_subagent_demo_blocked",
			status: "blocked",
			input: { reason: "Need credentials", needs: ["API token", "target account"] },
		});

		expect(result.pi.messages).toHaveLength(1);
		const text = messageText(result.pi.messages[0]!);
		expect(text).toContain("⚠ Runner subagent blocked: Need credentials");
		expect(text).toContain("- API token");
		expect(text).toContain(`Session file: ${SESSION_FILE}`);
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("protocol-error result is surfaced without pretending success", async () => {
		const result = await runRunnerSubagentDemo("Trigger protocol failure", {
			version: 1,
			kind: "terminal-capture",
			toolName: "unknown_terminal_tool",
			status: "completed",
			input: { summary: "not valid" },
		});

		expect(result.pi.messages).toHaveLength(1);
		const text = messageText(result.pi.messages[0]!);
		expect(text).toContain("✗ Runner subagent protocol-error");
		expect(text).toContain("unknown_terminal_tool");
		expect(text).toContain(`Session file: ${SESSION_FILE}`);
		expect(text).not.toContain("✓ Runner subagent completed");
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("above-editor widget is set while running and cleared after completion", async () => {
		const result = await runRunnerSubagentDemo("Report progress", {
			version: 1,
			kind: "terminal-capture",
			toolName: "runner_subagent_demo_complete",
			status: "completed",
			input: { summary: "Done" },
		});

		expect(result.statuses).toEqual([]);
		expect(result.widgets[0]?.value?.[0]).toContain("Runner subagent demo: Report progress");
		expect(result.widgets[0]?.options).toEqual({ placement: "aboveEditor" });
		expect(result.widgets.some((widget) => widget.value?.some((line) => line === `Session: ${SESSION_FILE}`))).toBe(true);
		expect(result.widgets.at(-1)).toEqual({
			key: RUNNER_SUBAGENT_DEMO_COMMAND_NAME,
			value: undefined,
			options: { placement: "aboveEditor" },
		});
	});

	test("no UI calls are required when ctx.hasUI is false", async () => {
		const result = await runRunnerSubagentDemo(
			"Run headless",
			{
				version: 1,
				kind: "terminal-capture",
				toolName: "runner_subagent_demo_complete",
				status: "completed",
				input: { summary: "Headless done" },
			},
			{ hasUI: false },
		);

		expect(result.notifications).toEqual([]);
		expect(result.statuses).toEqual([]);
		expect(result.widgets).toEqual([]);
		expect(result.messages).toHaveLength(1);
		expect(messageText(result.messages[0]!)).toContain("Headless done");
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("prompt instructs terminal capture completion instead of slash-command handoff", () => {
		const prompt = buildRunnerSubagentDemoPrompt("Check docs");

		expect(prompt).toContain("exactly one terminal tool");
		expect(prompt).toContain("runner_subagent_demo_complete");
		expect(prompt).toContain("runner_subagent_demo_blocked");
		expect(prompt).toContain("Do not use slash-command text as a completion handoff");
		expect(prompt).not.toContain("sendUserMessage");
	});
});

import { describe, expect, test } from "vitest";

import type { ExecOptions, ExecResult } from "@sdl/core/exec";

import type { ModelInfo, ThinkingLevel } from "../src/cmux/types.ts";
import investigateExtension, {
	INVESTIGATE_COMMAND_NAME,
	INVESTIGATE_RESULT_MESSAGE_TYPE,
	INVESTIGATOR_CHILD_TOOL_NAMES,
	buildInvestigationTitle,
	type InvestigateExtensionAPI,
} from "../src/investigate.ts";
import type { PiAgentDefinition } from "../src/pi-agent-definition.ts";
import {
	RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES,
	type RunnerSubagentPi,
} from "../src/runner-subagent.ts";
import type { RunnerSubagentDispatcherDependencies } from "../src/runner-subagent/subagent-process.ts";
import type { CommandContext, CustomMessage } from "../src/handoff/runtime-types.ts";
import {
	createFakeRunnerSubagentDispatcher,
	jsonLine,
	waitForSpawn,
} from "./runner-subagent-fakes.ts";

const ROOT = "/repo";
const SESSION_FILE = "/tmp/investigator-child.jsonl";
const DEFAULT_INVESTIGATOR_BODY = "You are a fixture investigator.\n\nPrompt:\n\n{{prompt}}";

type RegisteredCommand = Parameters<InvestigateExtensionAPI["registerCommand"]>[1];

interface FakeExecCall {
	command: string;
	args: string[];
	options?: ExecOptions;
}

interface NotifyRecord {
	message: string;
	level?: "info" | "warning" | "error";
}

interface WidgetRecord {
	key: string;
	value: string[] | undefined;
	options?: { placement?: "aboveEditor" | "belowEditor" };
}

class FakePi implements InvestigateExtensionAPI, RunnerSubagentPi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: CustomMessage[] = [];
	readonly renderers = new Map<string, unknown>();
	readonly execCalls: FakeExecCall[] = [];
	execHandler = (_command: string, _args: string[], _options?: ExecOptions): ExecResult => ({
		stdout: "",
		stderr: "",
		code: 0,
		killed: false,
	});
	[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	private readonly thinkingLevel: ThinkingLevel;

	constructor(
		dependencies?: RunnerSubagentDispatcherDependencies,
		options: { thinkingLevel?: ThinkingLevel } = {},
	) {
		if (dependencies !== undefined) this[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES] = dependencies;
		this.thinkingLevel = options.thinkingLevel ?? "off";
	}

	getThinkingLevel(): ThinkingLevel {
		return this.thinkingLevel;
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({
			command,
			args: [...args],
			...(options === undefined ? {} : { options }),
		});
		return this.execHandler(command, args, options);
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.renderers.set(customType, renderer);
	}

	sendMessage(message: CustomMessage): void {
		this.messages.push(message);
	}
}

interface FakeCommandContext extends CommandContext {
	readonly notifications: NotifyRecord[];
	readonly widgets: WidgetRecord[];
	readonly editorTexts: string[];
	waitForIdleCount: number;
	ui: CommandContext["ui"] & {
		setWidget?(
			key: string,
			value: string[] | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		): void;
	};
}

function makeContext(options: { model?: ModelInfo } = {}): FakeCommandContext {
	const notifications: NotifyRecord[] = [];
	const widgets: WidgetRecord[] = [];
	const editorTexts: string[] = [];
	const ctx: FakeCommandContext = {
		cwd: ROOT,
		hasUI: true,
		mode: "tui",
		...(options.model === undefined ? {} : { model: options.model }),
		notifications,
		widgets,
		editorTexts,
		waitForIdleCount: 0,
		ui: {
			notify(message, level): void {
				notifications.push({ message, ...(level === undefined ? {} : { level }) });
			},
			setEditorText(value): void {
				editorTexts.push(value);
			},
			setWidget(key, value, widgetOptions): void {
				widgets.push({
					key,
					value,
					...(widgetOptions === undefined ? {} : { options: widgetOptions }),
				});
			},
		},
		async waitForIdle(): Promise<void> {
			this.waitForIdleCount += 1;
		},
	};
	return ctx;
}

function register(
	pi: FakePi,
	overrides: { definition?: PiAgentDefinition } = {},
): RegisteredCommand {
	investigateExtension(pi, {
		loadAgentDefinition: () => overrides.definition ?? fakeInvestigatorDefinition(),
	});
	const command = pi.commands.get(INVESTIGATE_COMMAND_NAME);
	expect(command).toBeDefined();
	return command!;
}

function fakeInvestigatorDefinition(
	overrides: { toolName?: string; body?: string } = {},
): PiAgentDefinition {
	return {
		schema: "sdl.pi-agent.v1",
		name: "investigator",
		toolName: overrides.toolName ?? INVESTIGATE_COMMAND_NAME,
		label: "Investigator",
		description: "Run a fixture investigation.",
		promptGuidelines: [],
		body: overrides.body ?? DEFAULT_INVESTIGATOR_BODY,
		filePath: "/fixture/.sdl/pi/agents/investigator.md",
	};
}

function finalTextMessage(text: string, stopReason = "stop"): string {
	return jsonLine({
		type: "message_end",
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			stopReason,
		},
	});
}

describe("investigate extension", () => {
	test("registers a bare investigate command and result renderer", () => {
		const pi = new FakePi();
		const command = register(pi);

		expect(pi.commands.has(INVESTIGATE_COMMAND_NAME)).toBe(true);
		expect(command.description).toContain("read-only investigator subagent");
		expect(command.argumentHint).toBe("<investigation prompt>");
		expect(pi.renderers.has(INVESTIGATE_RESULT_MESSAGE_TYPE)).toBe(true);
	});

	test("blank prompt notifies usage and does not spawn a child", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const command = register(pi);
		const ctx = makeContext();

		await command.handler("   ", ctx);

		expect(ctx.waitForIdleCount).toBe(1);
		expect(ctx.notifications).toEqual([
			{ message: "Usage: /investigate <prompt>", level: "error" },
		]);
		expect(runner.calls).toEqual([]);
		expect(pi.messages).toEqual([]);
	});

	test("dispatches an investigator with curated context, inherited launch, and read-only child tools", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies, { thinkingLevel: "medium" });
		const command = register(pi);
		const ctx = makeContext({ model: { provider: "anthropic", id: "claude-sonnet-4-5" } });

		const running = command.handler(
			"why would `ts/packages/pi-extensions/src/runner-subagent.ts` matter?",
			ctx,
		);
		const call = await waitForSpawn(runner.calls);

		expect(pi.execCalls.map((execCall) => execCall.args)).toEqual([
			["status", "--short"],
			["diff", "--stat"],
		]);
		expect(call.args.slice(0, -1)).toEqual([
			"--mode",
			"json",
			"-p",
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-5",
			"--thinking",
			"medium",
			"--no-extensions",
			"--tools",
			INVESTIGATOR_CHILD_TOOL_NAMES.join(","),
			"--session",
			SESSION_FILE,
		]);
		expect(call.args).not.toContain("--extension");
		expect(call.options.cwd).toBe(ROOT);
		const childPrompt = call.args.at(-1) ?? "";
		expect(childPrompt).toContain("You are a fixture investigator.");
		expect(childPrompt).toContain(
			"why would `ts/packages/pi-extensions/src/runner-subagent.ts` matter?",
		);
		expect(childPrompt).toContain("## Auto-curated context");
		expect(childPrompt).toContain("Treat it as orientation, not ground truth");
		expect(ctx.widgets.some((widget) => widget.key === INVESTIGATE_COMMAND_NAME)).toBe(true);

		call.process.emitStdout(
			finalTextMessage("# Investigation Report\n\n## Short Answer\nIt matters."),
		);
		call.process.close(0);
		await running;

		expect(pi.messages).toHaveLength(1);
		expect(pi.messages[0]).toEqual(
			expect.objectContaining({
				customType: INVESTIGATE_RESULT_MESSAGE_TYPE,
				display: true,
				content: "# Investigation Report\n\n## Short Answer\nIt matters.",
			}),
		);
		expect(pi.messages[0]?.details).toEqual(
			expect.objectContaining({
				status: "final-text",
				curatedContext: expect.objectContaining({ markdownChars: expect.any(Number) }),
			}),
		);
		expect(ctx.widgets.at(-1)).toEqual({
			key: INVESTIGATE_COMMAND_NAME,
			value: undefined,
			options: { placement: "aboveEditor" },
		});
	});

	test("surfaces non-final statuses as diagnostics with session evidence", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const command = register(pi);
		const ctx = makeContext();

		const running = command.handler("investigate blank output", ctx);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(finalTextMessage("   "));
		call.process.close(0);
		await running;

		expect(pi.messages).toHaveLength(1);
		const content = String(pi.messages[0]?.content ?? "");
		expect(content).toContain("Status: stopped-without-useful-text");
		expect(content).toContain(
			"Diagnostic: Subagent Pi stopped without useful final assistant text.",
		);
		expect(content).toContain(`Session file: ${SESSION_FILE}`);
		expect(content).toContain(
			"Inspect the session file before treating this delegated task as complete.",
		);
	});

	test("fails fast when investigator definition declares a different tool name", async () => {
		const pi = new FakePi();
		const command = register(pi, {
			definition: fakeInvestigatorDefinition({ toolName: "other_tool" }),
		});
		const ctx = makeContext();

		await expect(command.handler("find facts", ctx)).rejects.toThrow(/declares toolName/);
	});

	test("builds short progress titles", () => {
		expect(buildInvestigationTitle("  one two\nthree   four ")).toBe(
			"Investigation: one two three four",
		);
		expect(buildInvestigationTitle("one two three four five six seven eight nine ten eleven")).toBe(
			"Investigation: one two three four five six seven eight nine ten…",
		);
	});
});

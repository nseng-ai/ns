import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { createManualClock } from "@nseng-ai/foundation/time/testing";

import type { ThinkingLevel } from "@nseng-ai/pi/runtime/types";
import {
	RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES,
	RunnerSubagentFleetRegistry,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
} from "@nseng-ai/ns-pi-subagents/runner-subagents";
import {
	MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS,
	DISPATCH_RUNNER_SUBAGENT_TOOL_NAME,
	formatDispatchRunnerSubagentResult,
	registerDispatchRunnerSubagentTool,
	type DispatchRunnerSubagentExtensionAPI,
	type DispatchRunnerSubagentToolDefinition,
	type ToolResult,
} from "../../src/runner-subagents/extension.ts";
import { SUBAGENT_FLEET_STATUS_KEY } from "../../src/fleet/display.ts";
import type { ToolContext } from "../../src/runner-subagents/extension.ts";
import {
	createFakeRunnerSubagentDispatcher,
	jsonLine,
	sessionMessageLine,
	type RunnerSubagentDispatcherDependencies,
	waitForSpawn,
} from "@nseng-ai/ns-pi-subagents/runner-subagents/testing";

const ROOT = "/repo";
const SESSION_FILE = "/tmp/text-child.jsonl";
const DEFAULT_RUNNER_BODY = "You are a fixture runner.\n\n## Delegated task\n\n{{prompt}}";

interface FakeExecCall {
	command: string;
	args: string[];
	options?: ExecOptions;
}

type FakeExecHandler = (
	command: string,
	args: string[],
	options?: ExecOptions,
) => Promise<ExecResult> | ExecResult;

class FakePi implements DispatchRunnerSubagentExtensionAPI, RunnerSubagentPi {
	readonly tools = new Map<string, DispatchRunnerSubagentToolDefinition>();
	readonly execCalls: FakeExecCall[] = [];
	execHandler: FakeExecHandler = () => ({ stdout: "", stderr: "", code: 0, killed: false });
	[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	[key: string]: unknown;
	private readonly thinkingLevel: ThinkingLevel;

	constructor(
		dependencies?: RunnerSubagentDispatcherDependencies,
		options: { thinkingLevel?: ThinkingLevel } = {},
	) {
		if (dependencies) this[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES] = dependencies;
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

	registerTool(tool: DispatchRunnerSubagentToolDefinition): void {
		this.tools.set(tool.name, tool);
	}
}

class OneShotThinkingPi extends FakePi {
	getThinkingLevelCallCount = 0;
	private readonly oneShotThinkingLevel: ThinkingLevel;

	constructor(dependencies: RunnerSubagentDispatcherDependencies, thinkingLevel: ThinkingLevel) {
		super(dependencies);
		this.oneShotThinkingLevel = thinkingLevel;
	}

	override getThinkingLevel(): ThinkingLevel {
		this.getThinkingLevelCallCount += 1;
		if (this.getThinkingLevelCallCount > 1) {
			throw new Error(
				"getThinkingLevel should only be used while resolving the dispatch launch once.",
			);
		}
		return this.oneShotThinkingLevel;
	}
}

interface RegisterToolOptions {
	pi?: FakePi;
	definitionRoot?: string;
}

function registerTool(options: RegisterToolOptions = {}): DispatchRunnerSubagentToolDefinition {
	const pi = options.pi ?? new FakePi();
	const definitionRoot = options.definitionRoot ?? createRunnerDefinitionRoot();
	registerDispatchRunnerSubagentTool(pi, {
		cwd: definitionRoot,
		fleetRegistry: new RunnerSubagentFleetRegistry(),
	});
	return getRegisteredDispatchRunnerSubagentTool(pi);
}

function getRegisteredDispatchRunnerSubagentTool(pi: FakePi): DispatchRunnerSubagentToolDefinition {
	const tool = pi.tools.get(DISPATCH_RUNNER_SUBAGENT_TOOL_NAME);
	if (tool === undefined) throw new Error("dispatch_runner_subagent tool was not registered.");
	return tool;
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

function sessionUsageJsonl(): string {
	return [
		sessionMessageLine({
			role: "assistant",
			usage: {
				input: 10_000,
				output: 40,
				cacheRead: 9_000,
				cacheWrite: 0,
				totalTokens: 19_040,
				cost: { input: 0.01, output: 0.02, cacheRead: 0.003, cacheWrite: 0, total: 0.033 },
			},
		}),
		sessionMessageLine({
			role: "assistant",
			usage: {
				input: 1_600,
				output: 4,
				cacheRead: 2_300,
				cacheWrite: 0,
				totalTokens: 3_904,
				cost: { input: 0.02, output: 0.01, cacheRead: 0.0018, cacheWrite: 0, total: 0.0318 },
			},
		}),
	].join("");
}

interface UiRecord {
	key: string;
	value: string | undefined;
}

interface WidgetRecord {
	key: string;
	value: string[] | undefined;
	options?: { placement?: "aboveEditor" | "belowEditor" };
}

function dispatchUiRecordsOnly(
	statuses: readonly UiRecord[],
	widgets: readonly WidgetRecord[],
): { nonFleetStatuses: UiRecord[]; dispatchWidgets: WidgetRecord[] } {
	return {
		nonFleetStatuses: statuses.filter((status) => status.key !== SUBAGENT_FLEET_STATUS_KEY),
		dispatchWidgets: widgets.filter((widget) => widget.key === DISPATCH_RUNNER_SUBAGENT_TOOL_NAME),
	};
}

function updateTexts(updates: readonly Partial<ToolResult>[]): string {
	return updates.map((update) => update.content?.[0]?.text ?? "").join("\n---\n");
}

function firstUpdateDetails(updates: readonly Partial<ToolResult>[]): Record<string, unknown> {
	const details = updates[0]?.details;
	expect(details).toBeDefined();
	return details as Record<string, unknown>;
}

interface ToolContextOptions {
	cwd?: string;
	hasUI?: boolean;
	mode?: ToolContext["mode"];
	model?: ToolContext["model"];
	sessionManager?: ToolContext["sessionManager"];
	ui?: Partial<ToolContext["ui"]>;
}

function toolContext(options: ToolContextOptions = {}): ToolContext {
	return {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		mode: options.mode ?? "tui",
		...(options.model === undefined ? {} : { model: options.model }),
		...(options.sessionManager === undefined ? {} : { sessionManager: options.sessionManager }),
		ui: {
			notify: () => {},
			...(options.ui === undefined ? {} : options.ui),
		},
	};
}

interface RunnerDefinitionOverrides {
	toolName?: string;
	label?: string;
	description?: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	body?: string;
}

function createRunnerDefinitionRoot(overrides: RunnerDefinitionOverrides = {}): string {
	const root = mkdtempSync(join(tmpdir(), "dispatch-runner-definition-"));
	writeRunnerDefinition(root, overrides);
	return root;
}

function writeRunnerDefinition(root: string, overrides: RunnerDefinitionOverrides = {}): void {
	const agentsDir = join(root, ".ns", "pi", "agents");
	mkdirSync(agentsDir, { recursive: true });
	writeFileSync(join(agentsDir, "runner.md"), runnerDefinitionMarkdown(overrides), "utf8");
}

function runnerDefinitionMarkdown(overrides: RunnerDefinitionOverrides = {}): string {
	const promptGuidelines = overrides.promptGuidelines ?? [
		"Use dispatch_runner_subagent only for a focused delegated task where the subagent prompt includes all necessary context.",
		"Use dispatch_runner_subagent sequentially in a shared worktree; inspect the returned status and sessionFile before deciding that work is complete.",
		"Do not treat non-final-text statuses from dispatch_runner_subagent as completion; inspect diagnostics and the forked Pi session file first.",
	];
	return [
		"---",
		"schema: ns.pi-agent.v1",
		"name: runner",
		`toolName: ${overrides.toolName ?? DISPATCH_RUNNER_SUBAGENT_TOOL_NAME}`,
		`label: ${overrides.label ?? "Dispatch Forked Pi Session"}`,
		`description: ${overrides.description ?? "Launch a focused forked Pi process in the current cwd and return its final assistant text/status evidence."}`,
		`promptSnippet: ${overrides.promptSnippet ?? "Launch a focused forked Pi process in the current cwd and return final assistant text"}`,
		"promptGuidelines:",
		...promptGuidelines.map((guideline) => `  - ${guideline}`),
		"---",
		"",
		overrides.body ?? DEFAULT_RUNNER_BODY,
		"",
	].join("\n");
}

function composedFixturePrompt(prompt: string): string {
	return DEFAULT_RUNNER_BODY.replace("{{prompt}}", prompt);
}

describe("dispatch_runner_subagent extension", () => {
	test("registers metadata from the Markdown definition with a strict title/prompt schema", () => {
		const pi = new FakePi();
		const definitionRoot = createRunnerDefinitionRoot({
			label: "Markdown Runner",
			description: "Markdown definition description with final assistant text.",
			promptSnippet: "Markdown definition snippet",
			promptGuidelines: ["Use dispatch_runner_subagent according to the Markdown definition."],
		});
		const tool = registerTool({ pi, definitionRoot });
		const schema = tool.parameters;

		expect(pi.tools.has(DISPATCH_RUNNER_SUBAGENT_TOOL_NAME)).toBe(true);
		expect(tool.label).toBe("Markdown Runner");
		expect(tool.description).toBe("Markdown definition description with final assistant text.");
		expect(tool.promptSnippet).toBe("Markdown definition snippet");
		expect(schema.type).toBe("object");
		expect(Object.keys(schema.properties ?? {}).sort()).toEqual(["model", "prompt", "title"]);
		expect(schema.required).toEqual(["title", "prompt"]);
		expect(schema.additionalProperties).toBe(false);
		expect(tool.promptGuidelines).toEqual([
			"Use dispatch_runner_subagent according to the Markdown definition.",
		]);
	});

	test("registers a degraded tool when runner.md declares a different toolName", async () => {
		const pi = new FakePi();
		const definitionRoot = createRunnerDefinitionRoot({ toolName: "other_runner_tool" });

		registerDispatchRunnerSubagentTool(pi, {
			cwd: definitionRoot,
			fleetRegistry: new RunnerSubagentFleetRegistry(),
		});

		const tool = getRegisteredDispatchRunnerSubagentTool(pi);
		const result = await tool.execute(
			"tool-1",
			{ title: "Bad runner", prompt: "Do work." },
			undefined,
			undefined,
			toolContext(),
		);
		expect(result.content[0]?.text).toMatch(/declares toolName.*expected/);
		expect(result.details).toMatchObject({
			status: "configuration-error",
			title: "Bad runner",
		});
		expect(result.isError).toBe(true);
	});

	test("recovers when runner.md is fixed without restarting Pi", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const definitionRoot = createRunnerDefinitionRoot({ toolName: "other_runner_tool" });
		registerDispatchRunnerSubagentTool(pi, {
			cwd: definitionRoot,
			fleetRegistry: new RunnerSubagentFleetRegistry(),
		});
		const tool = getRegisteredDispatchRunnerSubagentTool(pi);

		const bad = await tool.execute(
			"tool-1",
			{ title: "Bad runner", prompt: "Do work." },
			undefined,
			undefined,
			toolContext(),
		);
		expect(bad.details).toMatchObject({ status: "configuration-error" });
		expect(bad.isError).toBe(true);
		expect(runner.calls).toEqual([]);

		writeRunnerDefinition(definitionRoot);
		const running = tool.execute(
			"tool-2",
			{ title: "Fixed runner", prompt: "Do work." },
			undefined,
			undefined,
			toolContext(),
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(finalTextMessage("Recovered."));
		call.process.close(0);

		await expect(running).resolves.toEqual(
			expect.objectContaining({ details: expect.objectContaining({ status: "final-text" }) }),
		);
	});

	test("registers dispatch runs in the subagent fleet", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			sessionFile: SESSION_FILE,
			sessionFileText: sessionMessageLine(finalTextMessage("Fleet result.")),
		});
		const pi = new FakePi(runner.dependencies);
		const fleetRegistry = new RunnerSubagentFleetRegistry();
		const definitionRoot = createRunnerDefinitionRoot();
		registerDispatchRunnerSubagentTool(pi, { cwd: definitionRoot, fleetRegistry });
		const tool = getRegisteredDispatchRunnerSubagentTool(pi);

		const running = tool.execute(
			"tool-1",
			{ title: "Fleet dispatch", prompt: "Report through fleet." },
			undefined,
			undefined,
			toolContext({ sessionManager: { getSessionFile: () => "/tmp/parent.jsonl" } }),
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(finalTextMessage("Fleet result."));
		call.process.close(0);
		await running;

		const [run] = fleetRegistry.snapshot();
		expect(run?.parentSessionFile).toBe("/tmp/parent.jsonl");
		expect(run?.tasks[0]).toMatchObject({
			title: "Fleet dispatch",
			state: "done",
			finalStatus: "final-text",
			sessionFile: SESSION_FILE,
		});
	});

	test("passes explicit title, composed prompt, cwd, model, and thinking to dispatchRunnerSubagent without a runtime extension", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			sessionFile: SESSION_FILE,
			sessionFileText: sessionUsageJsonl(),
		});
		const pi = new FakePi(runner.dependencies, { thinkingLevel: "medium" });
		const tool = registerTool({ pi });
		const updates: Partial<ToolResult>[] = [];

		const running = tool.execute(
			"tool-1",
			{ title: "Slice subagent", prompt: "Do focused work." },
			undefined,
			(partial) => updates.push(partial),
			toolContext({ model: { provider: "anthropic", id: "claude-sonnet-4-5" } }),
		);
		const call = await waitForSpawn(runner.calls);

		expect(updates[0]?.content?.[0]?.text).toBe("Dispatching forked Pi process: Slice subagent");
		expect(call.options.cwd).toBe(ROOT);
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
			"--session",
			SESSION_FILE,
		]);
		const childPrompt = call.args.at(-1) ?? "";
		expect(childPrompt.startsWith(composedFixturePrompt("Do focused work."))).toBe(true);
		expect(childPrompt).toContain("Treat it as orientation, not ground truth");
		expect(childPrompt.indexOf("## Auto-curated context")).toBeGreaterThan(
			childPrompt.indexOf("## Delegated task"),
		);
		expect(call.args).not.toContain("--extension");
		const launchDetails = firstUpdateDetails(updates);
		expect((launchDetails.progress as Record<string, unknown>).launch).toEqual({
			model: { provider: "anthropic", id: "claude-sonnet-4-5" },
			thinkingLevel: "medium",
			hasModelArg: true,
			hasThinkingArg: true,
		});
		expect(launchDetails.curatedContext).toEqual(
			expect.objectContaining({ markdownChars: expect.any(Number) }),
		);

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Model: anthropic/claude-sonnet-4-5; Thinking: medium");
		expect(text).toContain("Usage: 11.6k in / 44 out, cache R11.3k W0, $0.0648");
		expect(text).not.toContain("hasModelArg");
		expect(text).not.toContain("hasThinkingArg");
		expect((details.progress as Record<string, unknown>).launch).toEqual({
			model: { provider: "anthropic", id: "claude-sonnet-4-5" },
			thinkingLevel: "medium",
			hasModelArg: true,
			hasThinkingArg: true,
		});
		expect(details.usage).toEqual(
			expect.objectContaining({ status: "available", assistantMessageCount: 2 }),
		);
		expect(details.curatedContext).toEqual(
			expect.objectContaining({ markdownChars: expect.any(Number) }),
		);
	});

	test("trims title, prompt, and optional model before dispatching", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });
		const updates: Partial<ToolResult>[] = [];

		const running = tool.execute(
			"tool-1",
			{
				title: "  Slice subagent  ",
				prompt: "\n\tDo focused work.  ",
				model: " openai-codex/gpt-5.4-mini ",
				extraIgnoredProperty: true,
			},
			undefined,
			(partial) => updates.push(partial),
			toolContext(),
		);
		const call = await waitForSpawn(runner.calls);

		expect(updates[0]?.content?.[0]?.text).toBe("Dispatching forked Pi process: Slice subagent");
		expect(call.args.slice(0, -1)).toEqual([
			"--mode",
			"json",
			"-p",
			"--model",
			"openai-codex/gpt-5.4-mini",
			"--no-extensions",
			"--session",
			SESSION_FILE,
		]);
		expect(call.args.at(-1)).toContain(composedFixturePrompt("Do focused work."));

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;
		const details = result.details as Record<string, unknown>;
		expect(details.title).toBe("Slice subagent");
		expect(details.requestedModel).toBe("openai-codex/gpt-5.4-mini");
	});

	test("threads cwd and abort signal through curated git evidence collection", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });
		const abortController = new AbortController();

		const running = tool.execute(
			"tool-1",
			{ title: "Slice subagent", prompt: "Do focused work." },
			abortController.signal,
			undefined,
			toolContext(),
		);
		const call = await waitForSpawn(runner.calls);

		expect(pi.execCalls).toHaveLength(2);
		expect(pi.execCalls.map((execCall) => execCall.args)).toEqual([
			["status", "--short"],
			["diff", "--stat"],
		]);
		for (const execCall of pi.execCalls) {
			expect(execCall.command).toBe("git");
			expect(execCall.options?.cwd).toBe(ROOT);
			expect(execCall.options?.signal).toBe(abortController.signal);
			expect(execCall.options?.timeout).toBeGreaterThan(0);
		}

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		await expect(running).resolves.toEqual(
			expect.objectContaining({ details: expect.objectContaining({ status: "final-text" }) }),
		);
	});

	test("uses the resolved launch metadata without re-resolving it as launch options", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new OneShotThinkingPi(runner.dependencies, "medium");
		const tool = registerTool({ pi });

		const running = tool.execute(
			"tool-1",
			{ title: "Slice subagent", prompt: "Do focused work." },
			undefined,
			undefined,
			toolContext({ model: { provider: "anthropic", id: "claude-sonnet-4-5" } }),
		);
		const call = await waitForSpawn(runner.calls);

		expect(pi.getThinkingLevelCallCount).toBe(1);
		expect(call.args).toContain("--thinking");
		expect(call.args).toContain("medium");

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		await expect(running).resolves.toEqual(
			expect.objectContaining({ details: expect.objectContaining({ status: "final-text" }) }),
		);
		expect(pi.getThinkingLevelCallCount).toBe(1);
	});

	test("passes optional model to child Pi invocation and reports requested model details", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies, { thinkingLevel: "high" });
		const tool = registerTool({ pi });
		const updates: Partial<ToolResult>[] = [];

		const running = tool.execute(
			"tool-1",
			{
				title: "Cheap classifier",
				prompt: "Classify feedback.",
				model: " openai-codex/gpt-5.4-mini:medium ",
			},
			undefined,
			(partial) => updates.push(partial),
			toolContext({ model: { provider: "openai-codex", id: "gpt-5.5" } }),
		);
		const call = await waitForSpawn(runner.calls);

		expect(call.args.slice(0, -1)).toEqual([
			"--mode",
			"json",
			"-p",
			"--model",
			"openai-codex/gpt-5.4-mini:medium",
			"--no-extensions",
			"--session",
			SESSION_FILE,
		]);
		expect(call.args.at(-1)).toContain(composedFixturePrompt("Classify feedback."));
		const launchDetails = firstUpdateDetails(updates);
		expect((launchDetails.progress as Record<string, unknown>).launch).toEqual({
			requestedModel: "openai-codex/gpt-5.4-mini:medium",
			thinkingLevel: "off",
			hasModelArg: true,
			hasThinkingArg: false,
		});

		call.process.emitStdout(
			jsonLine({ type: "model_change", provider: "openai-codex", modelId: "gpt-5.4-mini" }),
		);
		call.process.emitStdout(jsonLine({ type: "thinking_level_change", thinkingLevel: "medium" }));
		expect(updateTexts(updates)).toContain("Model: openai-codex/gpt-5.4-mini; Thinking: medium");
		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Model: openai-codex/gpt-5.4-mini; Thinking: medium");
		expect(details.requestedModel).toBe("openai-codex/gpt-5.4-mini:medium");
	});

	test("hydrates observed thinking from the child session file for final tool text", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			sessionFile: SESSION_FILE,
			sessionFileText: [
				jsonLine({ type: "model_change", provider: "openai-codex", modelId: "gpt-5.4-mini" }),
				jsonLine({ type: "thinking_level_change", thinkingLevel: "high" }),
			].join(""),
		});
		const pi = new FakePi(runner.dependencies, { thinkingLevel: "high" });
		const tool = registerTool({ pi });
		const updates: Partial<ToolResult>[] = [];

		const running = tool.execute(
			"tool-1",
			{ title: "Cheap classifier", prompt: "Classify feedback.", model: "openai/gpt-5.2" },
			undefined,
			(partial) => updates.push(partial),
			toolContext({ model: { provider: "openai-codex", id: "gpt-5.5" } }),
		);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "session", version: 3, id: "child", cwd: ROOT }));
		await Promise.resolve();
		await Promise.resolve();
		expect(updateTexts(updates)).toContain("Model: openai-codex/gpt-5.4-mini; Thinking: high");

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Model: openai-codex/gpt-5.4-mini; Thinking: high");
		expect((details.progress as Record<string, unknown>).launch as Record<string, unknown>).toEqual(
			{
				requestedModel: "openai/gpt-5.2",
				model: { provider: "openai-codex", id: "gpt-5.4-mini" },
				thinkingLevel: "off",
				observedThinkingLevel: "high",
				hasModelArg: true,
				hasThinkingArg: false,
			},
		);
	});

	test("inherits provider for unqualified optional model patterns", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies, { thinkingLevel: "high" });
		const tool = registerTool({ pi });

		const running = tool.execute(
			"tool-1",
			{ title: "OpenAI classifier", prompt: "Classify feedback.", model: "gpt-5" },
			undefined,
			undefined,
			toolContext({ model: { provider: "openai-codex", id: "gpt-5.5" } }),
		);
		const call = await waitForSpawn(runner.calls);

		expect(call.args.slice(0, -1)).toEqual([
			"--mode",
			"json",
			"-p",
			"--provider",
			"openai-codex",
			"--model",
			"gpt-5",
			"--no-extensions",
			"--session",
			SESSION_FILE,
		]);

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Model: openai-codex/gpt-5; Thinking: default (unobserved)");
		expect(details.requestedModel).toBe("gpt-5");
	});

	test("rejects bare cross-provider model shorthands instead of launching provider/model mismatches", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies, { thinkingLevel: "high" });
		const tool = registerTool({ pi });

		const result = await tool.execute(
			"tool-1",
			{ title: "Anthropic reviewer", prompt: "Review the change.", model: "sonnet" },
			undefined,
			undefined,
			toolContext({ model: { provider: "openai-codex", id: "gpt-5.5" } }),
		);

		expect(runner.calls).toEqual([]);
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;
		expect(text).toContain("Status: error");
		expect(text).toContain('unqualified model "sonnet"');
		expect(text).toContain('current session provider is "openai-codex"');
		expect(text).toContain("anthropic/sonnet");
		expect(text).not.toContain("openai-codex/sonnet");
		expect(details.status).toBe("error");
		expect(details.diagnostic).toBe(
			'Invalid runner subagent model override: unqualified model "sonnet" looks like an Anthropic model shorthand, but the current session provider is "openai-codex". Use a fully qualified model such as "anthropic/sonnet" to switch providers, or omit dispatch_runner_subagent.model to inherit the current session model.',
		);
	});

	test("streams parsed subagent progress through partial updates and UI without changing final result", async () => {
		const manualClock = createManualClock(1_000);
		const runner = createFakeRunnerSubagentDispatcher({
			sessionFile: SESSION_FILE,
			clock: manualClock.clock,
		});
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });
		const updates: Partial<ToolResult>[] = [];
		const statuses: UiRecord[] = [];
		const widgets: WidgetRecord[] = [];

		const running = tool.execute(
			"tool-1",
			{ title: "Slice subagent", prompt: "Do focused work." },
			undefined,
			(partial) => updates.push(partial),
			toolContext({
				ui: {
					setStatus(key: string, value: string | undefined): void {
						statuses.push({ key, value });
					},
					setWidget(
						key: string,
						value: string[] | undefined,
						options?: { placement?: "aboveEditor" | "belowEditor" },
					): void {
						widgets.push({ key, value, ...(options === undefined ? {} : { options }) });
					},
				},
			}),
		);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "agent_start" }));
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({
				type: "message_update",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Assistant preview unique." }],
				},
			}),
		);
		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_start",
				toolCallId: "tool-a",
				toolName: "read",
				args: { path: "secret-input.txt" },
			}),
		);
		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_end",
				toolCallId: "tool-a",
				toolName: "read",
				result: { content: [{ type: "text", text: "tool result preview unique" }] },
				isError: false,
			}),
		);
		call.process.emitStdout(finalTextMessage("Subagent final answer."));
		manualClock.setMs(2_250);
		call.process.close(0);

		const result = await running;
		const partialText = updateTexts(updates);
		const finalText = result.content[0]?.text ?? "";
		const { nonFleetStatuses, dispatchWidgets } = dispatchUiRecordsOnly(statuses, widgets);

		expect(partialText).toContain("Dispatching forked Pi process: Slice subagent");
		expect(partialText).toContain("State: running");
		expect(partialText).toContain("current tool: read");
		expect(partialText).toContain("turns: 1");
		expect(partialText).toContain("tools: 1");
		expect(partialText).toContain("Model: default (not specified); Thinking: off");
		expect(partialText).toContain(`Session file: ${SESSION_FILE}`);
		expect(partialText).not.toContain("Assistant preview unique.");
		expect(partialText).not.toContain("secret-input.txt");
		expect(partialText).not.toContain("tool result preview unique");
		for (const update of updates) {
			const details = update.details as Record<string, unknown>;
			expect(details.progress).toBeDefined();
			expect(details.usage).toBeUndefined();
			expect(details.activity).toBeUndefined();
		}
		expect(nonFleetStatuses).toEqual([]);
		expect(widgets.some((widget) => widget.value?.includes("Model: default (not specified)"))).toBe(
			true,
		);
		expect(widgets.some((widget) => widget.value?.includes("Thinking: off"))).toBe(true);
		expect(
			widgets.some((widget) => widget.value?.includes("Assistant: Assistant preview unique.")),
		).toBe(true);
		expect(
			widgets.some((widget) => widget.value?.includes('Input: {"path":"secret-input.txt"}')),
		).toBe(true);
		expect(
			widgets.some((widget) =>
				widget.value?.includes("Last result (read): tool result preview unique"),
			),
		).toBe(true);
		expect(widgets.some((widget) => widget.value?.includes("Tool: read"))).toBe(true);
		expect(widgets.some((widget) => widget.options?.placement === "aboveEditor")).toBe(true);
		expect(dispatchWidgets.at(-1)).toEqual({
			key: DISPATCH_RUNNER_SUBAGENT_TOOL_NAME,
			value: undefined,
			options: { placement: "aboveEditor" },
		});
		expect(finalText).toContain("dispatch_runner_subagent result");
		expect(finalText).toContain("Status: final-text");
		expect(finalText).toContain("Subagent final answer.");
		expect(finalText).not.toContain("Running forked Pi process:");
		expect(finalText).not.toContain("Assistant preview unique.");
		expect(finalText).not.toContain("secret-input.txt");
		expect(finalText).not.toContain("tool result preview unique");
		expect(
			((result.details as Record<string, unknown>).progress as Record<string, unknown>).launch,
		).toEqual({
			thinkingLevel: "off",
			hasModelArg: false,
			hasThinkingArg: false,
		});
		expect((result.details as Record<string, unknown>).activity).toBeUndefined();
	});

	test("returns final text, status, session path, progress, and details as an ordinary tool result", async () => {
		const manualClock = createManualClock(1_000);
		const runner = createFakeRunnerSubagentDispatcher({
			sessionFile: SESSION_FILE,
			clock: manualClock.clock,
		});
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });

		const running = tool.execute(
			"tool-1",
			{ title: "Slice subagent", prompt: "Do focused work." },
			undefined,
			undefined,
			toolContext(),
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-a", toolName: "read", args: {} }),
		);
		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_end",
				toolCallId: "tool-a",
				toolName: "read",
				result: {},
				isError: false,
			}),
		);
		call.process.emitStdout(finalTextMessage("Subagent final answer.\nEvidence: test fixture."));
		manualClock.setMs(2_250);
		call.process.close(0);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("dispatch_runner_subagent result");
		expect(text).toContain("Status: final-text");
		expect(text).toContain("Subagent final answer.");
		expect(text).toContain(`Session file: ${SESSION_FILE}`);
		expect(text).toContain("Usage: unavailable (no assistant usage)");
		expect(text).toContain("Elapsed: 1.3s; turns: 1; tools: 1");
		expect(details.status).toBe("final-text");
		expect(details.sessionFile).toBe(SESSION_FILE);
		expect(details.finalTextChars).toBe("Subagent final answer.\nEvidence: test fixture.".length);
		expect(details.finalTextTruncated).toBe(false);
		expect(details.progress).toEqual(expect.objectContaining({ turnCount: 1, toolCount: 1 }));
		expect(details.usage).toEqual(
			expect.objectContaining({ status: "unavailable", reason: "no-assistant-usage" }),
		);
		expect(details.activity).toBeUndefined();
	});

	test("preserves no-useful-text as a non-complete diagnostic without throwing", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });

		const running = tool.execute(
			"tool-1",
			{ title: "Blank subagent", prompt: "Report back." },
			undefined,
			undefined,
			toolContext(),
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(finalTextMessage("   "));
		call.process.close(0);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Status: stopped-without-useful-text");
		expect(text).toContain(
			"Diagnostic: Forked Pi process stopped without useful final assistant text.",
		);
		expect(text).toContain(
			"Inspect the session file before treating this delegated task as complete.",
		);
		expect(details.status).toBe("stopped-without-useful-text");
		expect(details.diagnostic).toBe(
			"Forked Pi process stopped without useful final assistant text.",
		);
	});

	test("formats non-final-text statuses as diagnostics instead of completion", () => {
		const progress = {
			title: "Diagnostic subagent",
			state: "stopped" as const,
			toolCount: 1,
			turnCount: 2,
			elapsedMs: 1_250,
			sessionFile: SESSION_FILE,
		};
		const completed: RunnerSubagentResult = {
			status: "completed",
			elapsedMs: 1_250,
			progress,
			sessionFile: SESSION_FILE,
			terminal: { toolName: "done", status: "completed", input: { summary: "Done" } },
		};
		const blocked: RunnerSubagentResult = {
			status: "blocked",
			elapsedMs: 1_250,
			progress,
			sessionFile: SESSION_FILE,
			terminal: { toolName: "blocked", status: "blocked", input: { reason: "Need input" } },
		};
		const error: RunnerSubagentResult = {
			status: "error",
			elapsedMs: 1_250,
			progress,
			sessionFile: SESSION_FILE,
			diagnostic: "Forked Pi process exited with exit code 2.",
			error: { message: "Forked Pi process exited with exit code 2." },
		};
		const protocolError: RunnerSubagentResult = {
			status: "protocol-error",
			elapsedMs: 1_250,
			progress,
			sessionFile: SESSION_FILE,
			diagnostic: "Terminal tool was mixed with sibling tool calls.",
			protocolError: { message: "Terminal tool was mixed with sibling tool calls." },
		};

		for (const result of [completed, blocked, error, protocolError]) {
			const text = formatDispatchRunnerSubagentResult(result);
			expect(text).toContain(`Status: ${result.status}`);
			expect(text).not.toContain("Final text:");
			expect(text).toContain(
				"Inspect the session file before treating this delegated task as complete.",
			);
		}
		expect(formatDispatchRunnerSubagentResult(completed)).toContain(
			"completed with a terminal capture instead of final assistant text",
		);
		expect(formatDispatchRunnerSubagentResult(blocked)).toContain(
			"blocked with a terminal capture instead of final assistant text",
		);
	});

	test("preserves subagent error statuses as ordinary diagnostic tool results", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });

		const running = tool.execute(
			"tool-1",
			{ title: "Error subagent", prompt: "Report back." },
			undefined,
			undefined,
			toolContext(),
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStderr("subagent failed\n");
		call.process.close(2);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Status: error");
		expect(text).toContain("Diagnostic: Forked Pi process exited with exit code 2.");
		expect(text).toContain("subagent failed");
		expect(details.status).toBe("error");
		expect(details.sessionFile).toBe(SESSION_FILE);
		expect(details.error).toEqual(
			expect.objectContaining({
				message: expect.stringContaining("Forked Pi process exited with exit code 2"),
			}),
		);
	});

	test("does not require UI", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });

		const running = tool.execute(
			"tool-1",
			{ title: "Headless subagent", prompt: "Report back." },
			undefined,
			undefined,
			toolContext({ hasUI: false }),
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(finalTextMessage("Headless done."));
		call.process.close(0);

		const result = await running;
		expect(result.content[0]?.text).toContain("Status: final-text");
		expect(result.content[0]?.text).toContain("Headless done.");
	});

	test("clears UI after error result", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });
		const statuses: UiRecord[] = [];
		const widgets: WidgetRecord[] = [];

		const running = tool.execute(
			"tool-1",
			{ title: "Error subagent", prompt: "Report back." },
			undefined,
			undefined,
			toolContext({
				ui: {
					setStatus(key: string, value: string | undefined): void {
						statuses.push({ key, value });
					},
					setWidget(
						key: string,
						value: string[] | undefined,
						options?: { placement?: "aboveEditor" | "belowEditor" },
					): void {
						widgets.push({ key, value, ...(options === undefined ? {} : { options }) });
					},
				},
			}),
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStderr("subagent failed\n");
		call.process.close(2);

		const result = await running;
		const details = result.details as Record<string, unknown>;
		const { nonFleetStatuses, dispatchWidgets } = dispatchUiRecordsOnly(statuses, widgets);
		expect(details.status).toBe("error");
		expect(nonFleetStatuses).toEqual([]);
		expect(dispatchWidgets.at(-1)).toEqual({
			key: DISPATCH_RUNNER_SUBAGENT_TOOL_NAME,
			value: undefined,
			options: { placement: "aboveEditor" },
		});
	});

	test("rejects blank title, prompt, or provided model before spawning a subagent", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });

		await expect(
			tool.execute(
				"tool-1",
				{ title: "   ", prompt: "Do focused work." },
				undefined,
				undefined,
				toolContext(),
			),
		).rejects.toThrow("title: Too small");
		await expect(
			tool.execute(
				"tool-2",
				{ title: "Slice subagent", prompt: "\n\t" },
				undefined,
				undefined,
				toolContext(),
			),
		).rejects.toThrow("prompt: Too small");
		await expect(
			tool.execute(
				"tool-3",
				{ title: "Slice subagent", prompt: "Do focused work.", model: "   " },
				undefined,
				undefined,
				toolContext(),
			),
		).rejects.toThrow("model: Too small");
		expect(runner.calls).toEqual([]);
	});

	test("reports all dispatch input schema issues before spawning a subagent", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });

		await expect(
			tool.execute(
				"tool-1",
				{ title: "   ", prompt: "\n\t", model: "   " },
				undefined,
				undefined,
				toolContext(),
			),
		).rejects.toThrow(
			"title: Too small: expected string to have >=1 characters; prompt: Too small: expected string to have >=1 characters; model: Too small: expected string to have >=1 characters",
		);
		expect(runner.calls).toEqual([]);
	});

	test("truncates long final text in model-visible content while preserving machine-readable evidence", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });
		const longText = `${"x".repeat(MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS + 5)}END_UNIQUE`;

		const running = tool.execute(
			"tool-1",
			{ title: "Long subagent", prompt: "Return a long answer." },
			undefined,
			undefined,
			toolContext(),
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(finalTextMessage(longText));
		call.process.close(0);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Status: final-text");
		expect(text).toContain("Final text truncated");
		expect(text).toContain(
			`${MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS} of ${longText.length} characters`,
		);
		expect(text).toContain(SESSION_FILE);
		expect(text).not.toContain("END_UNIQUE");
		expect(details.finalTextChars).toBe(longText.length);
		expect(details.finalTextTruncated).toBe(true);
	});
});

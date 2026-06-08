import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { ThinkingLevel } from "../src/cmux/types.ts";
import {
	RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
} from "../src/runner-subagent.ts";
import type { RunnerSubagentDispatcherDependencies } from "../src/runner-subagent/subagent-process.ts";
import dispatchRunnerSubagentExtension, {
	MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS,
	DISPATCH_RUNNER_SUBAGENT_TOOL_NAME,
	formatDispatchRunnerSubagentResult,
	type ExtensionAPI,
	type ToolDefinition,
	type ToolResult,
} from "../src/dispatch-runner-subagent.ts";
import { createFakeRunnerSubagentDispatcher, jsonLine, sessionMessageLine, waitForSpawn } from "./runner-subagent-fakes.ts";

const ROOT = "/repo";
const SESSION_FILE = "/tmp/text-child.jsonl";
const DEFAULT_RUNNER_BODY = "You are a fixture runner.\n\n## Delegated task\n\n{{prompt}}";

interface JsonSchemaObject {
	type: string;
	properties?: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
}

class FakePi implements ExtensionAPI, RunnerSubagentPi {
	readonly tools = new Map<string, ToolDefinition>();
	[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	[key: string]: unknown;
	private readonly thinkingLevel: ThinkingLevel;

	constructor(dependencies?: RunnerSubagentDispatcherDependencies, options: { thinkingLevel?: ThinkingLevel } = {}) {
		if (dependencies) this[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES] = dependencies;
		this.thinkingLevel = options.thinkingLevel ?? "off";
	}

	getThinkingLevel(): ThinkingLevel {
		return this.thinkingLevel;
	}

	registerTool(tool: ToolDefinition): void {
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
			throw new Error("getThinkingLevel should only be used while resolving the dispatch launch once.");
		}
		return this.oneShotThinkingLevel;
	}
}

interface RegisterToolOptions {
	pi?: FakePi;
	definitionRoot?: string;
}

function registerTool(options: RegisterToolOptions = {}): ToolDefinition {
	const pi = options.pi ?? new FakePi();
	const definitionRoot = options.definitionRoot ?? createRunnerDefinitionRoot();
	dispatchRunnerSubagentExtension(pi, { cwd: definitionRoot });
	const tool = pi.tools.get(DISPATCH_RUNNER_SUBAGENT_TOOL_NAME);
	expect(tool).toBeDefined();
	return tool!;
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

function updateTexts(updates: readonly ToolResult[]): string {
	return updates.map((update) => update.content[0]?.text ?? "").join("\n---\n");
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
	const agentsDir = join(root, ".asdl", "pi", "agents");
	mkdirSync(agentsDir, { recursive: true });
	writeFileSync(join(agentsDir, "runner.md"), runnerDefinitionMarkdown(overrides), "utf8");
}

function runnerDefinitionMarkdown(overrides: RunnerDefinitionOverrides = {}): string {
	const promptGuidelines = overrides.promptGuidelines ?? [
		"Use dispatch_runner_subagent only for a focused delegated task where the subagent prompt includes all necessary context.",
		"Use dispatch_runner_subagent sequentially in a shared worktree; inspect the returned status and sessionFile before deciding that work is complete.",
		"Do not treat non-final-text statuses from dispatch_runner_subagent as completion; inspect diagnostics and the subagent session file first.",
	];
	return [
		"---",
		"schema: asdl.pi-agent.v1",
		"name: runner",
		`toolName: ${overrides.toolName ?? DISPATCH_RUNNER_SUBAGENT_TOOL_NAME}`,
		`label: ${overrides.label ?? "Dispatch Runner Subagent"}`,
		`description: ${overrides.description ?? "Launch a focused subagent Pi session in the current cwd and return its final assistant text/status evidence."}`,
		`promptSnippet: ${overrides.promptSnippet ?? "Launch a focused subagent Pi session in the current cwd and return final assistant text"}`,
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
		const schema = tool.parameters as JsonSchemaObject;

		expect(pi.tools.has(DISPATCH_RUNNER_SUBAGENT_TOOL_NAME)).toBe(true);
		expect(tool.label).toBe("Markdown Runner");
		expect(tool.description).toBe("Markdown definition description with final assistant text.");
		expect(tool.promptSnippet).toBe("Markdown definition snippet");
		expect(schema.type).toBe("object");
		expect(Object.keys(schema.properties ?? {}).sort()).toEqual(["model", "prompt", "title"]);
		expect(schema.required).toEqual(["title", "prompt"]);
		expect(schema.additionalProperties).toBe(false);
		expect(tool.promptGuidelines).toEqual(["Use dispatch_runner_subagent according to the Markdown definition."]);
	});

	test("fails fast when runner.md declares a different toolName", () => {
		const pi = new FakePi();
		const definitionRoot = createRunnerDefinitionRoot({ toolName: "other_runner_tool" });

		expect(() => dispatchRunnerSubagentExtension(pi, { cwd: definitionRoot })).toThrow(/declares toolName.*expected/);
		expect(pi.tools.size).toBe(0);
	});

	test("passes explicit title, composed prompt, cwd, model, and thinking to dispatchRunnerSubagent without a runtime extension", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE, sessionFileText: sessionUsageJsonl() });
		const pi = new FakePi(runner.dependencies, { thinkingLevel: "medium" });
		const tool = registerTool({ pi });
		const updates: ToolResult[] = [];

		const running = tool.execute(
			"tool-1",
			{ title: "Slice subagent", prompt: "Do focused work." },
			undefined,
			(partial) => updates.push(partial),
			{ cwd: ROOT, model: { provider: "anthropic", id: "claude-sonnet-4-5" } },
		);
		const call = await waitForSpawn(runner.calls);

		expect(updates[0]?.content[0]?.text).toBe("Dispatching runner subagent: Slice subagent");
		expect(call.options.cwd).toBe(ROOT);
		expect(call.args).toEqual([
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
			composedFixturePrompt("Do focused work."),
		]);
		expect(call.args).not.toContain("--extension");
		expect(((updates[0]?.details as Record<string, unknown>).progress as Record<string, unknown>).launch).toEqual({
			model: { provider: "anthropic", id: "claude-sonnet-4-5" },
			thinkingLevel: "medium",
			hasModelArg: true,
			hasThinkingArg: true,
		});

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
		expect(details.usage).toEqual(expect.objectContaining({ status: "available", assistantMessageCount: 2 }));
	});

	test("uses the resolved launch metadata without re-resolving it as launch options", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new OneShotThinkingPi(runner.dependencies, "medium");
		const tool = registerTool({ pi });

		const running = tool.execute("tool-1", { title: "Slice subagent", prompt: "Do focused work." }, undefined, undefined, {
			cwd: ROOT,
			model: { provider: "anthropic", id: "claude-sonnet-4-5" },
		});
		const call = await waitForSpawn(runner.calls);

		expect(pi.getThinkingLevelCallCount).toBe(1);
		expect(call.args).toContain("--thinking");
		expect(call.args).toContain("medium");

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		await expect(running).resolves.toEqual(expect.objectContaining({ details: expect.objectContaining({ status: "final-text" }) }));
		expect(pi.getThinkingLevelCallCount).toBe(1);
	});

	test("passes optional model to child Pi invocation and reports requested model details", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies, { thinkingLevel: "high" });
		const tool = registerTool({ pi });
		const updates: ToolResult[] = [];

		const running = tool.execute(
			"tool-1",
			{ title: "Cheap classifier", prompt: "Classify feedback.", model: " openai-codex/gpt-5.4-mini:medium " },
			undefined,
			(partial) => updates.push(partial),
			{ cwd: ROOT, model: { provider: "openai-codex", id: "gpt-5.5" } },
		);
		const call = await waitForSpawn(runner.calls);

		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--model",
			"openai-codex/gpt-5.4-mini:medium",
			"--no-extensions",
			"--session",
			SESSION_FILE,
			composedFixturePrompt("Classify feedback."),
		]);
		expect(((updates[0]?.details as Record<string, unknown>).progress as Record<string, unknown>).launch).toEqual({
			requestedModel: "openai-codex/gpt-5.4-mini:medium",
			thinkingLevel: "off",
			hasModelArg: true,
			hasThinkingArg: false,
		});

		call.process.emitStdout(jsonLine({ type: "model_change", provider: "openai-codex", modelId: "gpt-5.4-mini" }));
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

	test("streams parsed subagent progress through partial updates and UI without changing final result", async () => {
		let now = 1_000;
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE, now: () => now });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });
		const updates: ToolResult[] = [];
		const statuses: UiRecord[] = [];
		const widgets: WidgetRecord[] = [];

		const running = tool.execute(
			"tool-1",
			{ title: "Slice subagent", prompt: "Do focused work." },
			undefined,
			(partial) => updates.push(partial),
			{
				cwd: ROOT,
				hasUI: true,
				ui: {
					setStatus(key: string, value: string | undefined): void {
						statuses.push({ key, value });
					},
					setWidget(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void {
						widgets.push({ key, value, ...(options === undefined ? {} : { options }) });
					},
				},
			},
		);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "agent_start" }));
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({
				type: "message_update",
				message: { role: "assistant", content: [{ type: "text", text: "Assistant preview unique." }] },
			}),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-a", toolName: "read", args: { path: "secret-input.txt" } }),
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
		now = 2_250;
		call.process.close(0);

		const result = await running;
		const partialText = updateTexts(updates);
		const finalText = result.content[0]?.text ?? "";

		expect(partialText).toContain("Dispatching runner subagent: Slice subagent");
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
		expect(statuses).toEqual([]);
		expect(widgets.some((widget) => widget.value?.includes("Model: default (not specified)"))).toBe(true);
		expect(widgets.some((widget) => widget.value?.includes("Thinking: off"))).toBe(true);
		expect(widgets.some((widget) => widget.value?.includes("Assistant: Assistant preview unique."))).toBe(true);
		expect(widgets.some((widget) => widget.value?.includes('Input: {"path":"secret-input.txt"}'))).toBe(true);
		expect(widgets.some((widget) => widget.value?.includes("Last result (read): tool result preview unique"))).toBe(true);
		expect(widgets.some((widget) => widget.value?.includes("Tool: read"))).toBe(true);
		expect(widgets.some((widget) => widget.options?.placement === "aboveEditor")).toBe(true);
		expect(widgets.at(-1)).toEqual({
			key: DISPATCH_RUNNER_SUBAGENT_TOOL_NAME,
			value: undefined,
			options: { placement: "aboveEditor" },
		});
		expect(finalText).toContain("dispatch_runner_subagent result");
		expect(finalText).toContain("Status: final-text");
		expect(finalText).toContain("Subagent final answer.");
		expect(finalText).not.toContain("Running runner subagent:");
		expect(finalText).not.toContain("Assistant preview unique.");
		expect(finalText).not.toContain("secret-input.txt");
		expect(finalText).not.toContain("tool result preview unique");
		expect(((result.details as Record<string, unknown>).progress as Record<string, unknown>).launch).toEqual({
			thinkingLevel: "off",
			hasModelArg: false,
			hasThinkingArg: false,
		});
		expect((result.details as Record<string, unknown>).activity).toBeUndefined();
	});

	test("returns final text, status, session path, progress, and details as an ordinary tool result", async () => {
		let now = 1_000;
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE, now: () => now });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });

		const running = tool.execute(
			"tool-1",
			{ title: "Slice subagent", prompt: "Do focused work." },
			undefined,
			undefined,
			{ cwd: ROOT },
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(jsonLine({ type: "tool_execution_start", toolCallId: "tool-a", toolName: "read", args: {} }));
		call.process.emitStdout(jsonLine({ type: "tool_execution_end", toolCallId: "tool-a", toolName: "read", result: {}, isError: false }));
		call.process.emitStdout(finalTextMessage("Subagent final answer.\nEvidence: test fixture."));
		now = 2_250;
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
		expect(details.usage).toEqual(expect.objectContaining({ status: "unavailable", reason: "no-assistant-usage" }));
		expect(details.activity).toBeUndefined();
	});

	test("preserves no-useful-text as a non-complete diagnostic without throwing", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });

		const running = tool.execute("tool-1", { title: "Blank subagent", prompt: "Report back." }, undefined, undefined, { cwd: ROOT });
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(finalTextMessage("   "));
		call.process.close(0);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Status: stopped-without-useful-text");
		expect(text).toContain("Diagnostic: Subagent Pi stopped without useful final assistant text.");
		expect(text).toContain("Inspect the session file before treating this delegated task as complete.");
		expect(details.status).toBe("stopped-without-useful-text");
		expect(details.diagnostic).toBe("Subagent Pi stopped without useful final assistant text.");
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
			diagnostic: "Subagent Pi exited with exit code 2.",
			error: { message: "Subagent Pi exited with exit code 2." },
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
			expect(text).toContain("Inspect the session file before treating this delegated task as complete.");
		}
		expect(formatDispatchRunnerSubagentResult(completed)).toContain("completed with a terminal capture instead of final assistant text");
		expect(formatDispatchRunnerSubagentResult(blocked)).toContain("blocked with a terminal capture instead of final assistant text");
	});

	test("preserves subagent error statuses as ordinary diagnostic tool results", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });

		const running = tool.execute("tool-1", { title: "Error subagent", prompt: "Report back." }, undefined, undefined, { cwd: ROOT });
		const call = await waitForSpawn(runner.calls);
		call.process.emitStderr("subagent failed\n");
		call.process.close(2);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Status: error");
		expect(text).toContain("Diagnostic: Subagent Pi exited with exit code 2.");
		expect(text).toContain("subagent failed");
		expect(details.status).toBe("error");
		expect(details.sessionFile).toBe(SESSION_FILE);
		expect(details.error).toEqual(expect.objectContaining({ message: expect.stringContaining("Subagent Pi exited with exit code 2") }));
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
			{ cwd: ROOT, hasUI: false },
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
			{
				cwd: ROOT,
				hasUI: true,
				ui: {
					setStatus(key: string, value: string | undefined): void {
						statuses.push({ key, value });
					},
					setWidget(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void {
						widgets.push({ key, value, ...(options === undefined ? {} : { options }) });
					},
				},
			},
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStderr("subagent failed\n");
		call.process.close(2);

		const result = await running;
		const details = result.details as Record<string, unknown>;
		expect(details.status).toBe("error");
		expect(statuses).toEqual([]);
		expect(widgets.at(-1)).toEqual({
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
			tool.execute("tool-1", { title: "   ", prompt: "Do focused work." }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("non-empty title");
		await expect(tool.execute("tool-2", { title: "Slice subagent", prompt: "\n\t" }, undefined, undefined, { cwd: ROOT })).rejects.toThrow(
			"non-empty prompt",
		);
		await expect(
			tool.execute("tool-3", { title: "Slice subagent", prompt: "Do focused work.", model: "   " }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow(/model.*non-empty/);
		expect(runner.calls).toEqual([]);
	});

	test("truncates long final text in model-visible content while preserving machine-readable evidence", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool({ pi });
		const longText = `${"x".repeat(MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS + 5)}END_UNIQUE`;

		const running = tool.execute("tool-1", { title: "Long subagent", prompt: "Return a long answer." }, undefined, undefined, { cwd: ROOT });
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(finalTextMessage(longText));
		call.process.close(0);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Status: final-text");
		expect(text).toContain("Final text truncated");
		expect(text).toContain(`${MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS} of ${longText.length} characters`);
		expect(text).toContain(SESSION_FILE);
		expect(text).not.toContain("END_UNIQUE");
		expect(details.finalTextChars).toBe(longText.length);
		expect(details.finalTextTruncated).toBe(true);
	});
});

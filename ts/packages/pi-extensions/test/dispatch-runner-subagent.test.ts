import { describe, expect, test } from "bun:test";

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
import { createFakeRunnerSubagentDispatcher, waitForSpawn } from "./runner-subagent-fakes.ts";

const ROOT = "/repo";
const SESSION_FILE = "/tmp/text-child.jsonl";

type JsonSchemaObject = {
	type: string;
	properties?: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
};

class FakePi implements ExtensionAPI, RunnerSubagentPi {
	readonly tools = new Map<string, ToolDefinition>();
	[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	[key: string]: unknown;

	constructor(dependencies?: RunnerSubagentDispatcherDependencies) {
		if (dependencies) this[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES] = dependencies;
	}

	registerTool(tool: ToolDefinition): void {
		this.tools.set(tool.name, tool);
	}
}

function jsonLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

function registerTool(pi = new FakePi()): ToolDefinition {
	dispatchRunnerSubagentExtension(pi);
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

type UiRecord = { key: string; value: string | undefined };
type WidgetRecord = { key: string; value: string[] | undefined; options?: { placement?: "aboveEditor" | "belowEditor" } };

function updateTexts(updates: readonly ToolResult[]): string {
	return updates.map((update) => update.content[0]?.text ?? "").join("\n---\n");
}

describe("dispatch_runner_subagent extension", () => {
	test("registers the custom tool with a strict title/prompt schema", () => {
		const pi = new FakePi();
		const tool = registerTool(pi);
		const schema = tool.parameters as JsonSchemaObject;

		expect(pi.tools.has(DISPATCH_RUNNER_SUBAGENT_TOOL_NAME)).toBe(true);
		expect(tool.label).toBe("Dispatch Runner Subagent");
		expect(tool.description).toContain("final assistant text");
		expect(schema.type).toBe("object");
		expect(Object.keys(schema.properties ?? {}).sort()).toEqual(["prompt", "title"]);
		expect(schema.required).toEqual(["title", "prompt"]);
		expect(schema.additionalProperties).toBe(false);
		expect(tool.promptGuidelines).toHaveLength(3);
		expect(tool.promptGuidelines?.every((guideline) => guideline.includes(DISPATCH_RUNNER_SUBAGENT_TOOL_NAME))).toBe(true);
	});

	test("passes explicit title, prompt, and current cwd to dispatchRunnerSubagent without a runtime extension", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);
		const updates: ToolResult[] = [];

		const running = tool.execute(
			"tool-1",
			{ title: "Slice subagent", prompt: "Do focused work." },
			undefined,
			(partial) => updates.push(partial),
			{ cwd: ROOT },
		);
		const call = await waitForSpawn(runner.calls);

		expect(updates[0]?.content[0]?.text).toBe("Dispatching runner subagent: Slice subagent");
		expect(call.options.cwd).toBe(ROOT);
		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--no-extensions",
			"--session",
			SESSION_FILE,
			"Do focused work.",
		]);
		expect(call.args).not.toContain("--extension");

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		await running;
	});

	test("streams parsed subagent progress through partial updates and UI without changing final result", async () => {
		let now = 1_000;
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE, now: () => now });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);
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
		call.process.emitStdout(jsonLine({ type: "tool_execution_start", toolCallId: "tool-a", toolName: "read", args: {} }));
		call.process.emitStdout(jsonLine({ type: "tool_execution_end", toolCallId: "tool-a", toolName: "read", result: {}, isError: false }));
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
		expect(partialText).toContain(`Session file: ${SESSION_FILE}`);
		expect(statuses).toEqual([]);
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
	});

	test("returns final text, status, session path, progress, and details as an ordinary tool result", async () => {
		let now = 1_000;
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE, now: () => now });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);

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
		expect(text).toContain("Elapsed: 1.3s; turns: 1; tools: 1");
		expect(details.status).toBe("final-text");
		expect(details.sessionFile).toBe(SESSION_FILE);
		expect(details.finalTextChars).toBe("Subagent final answer.\nEvidence: test fixture.".length);
		expect(details.finalTextTruncated).toBe(false);
		expect(details.progress).toEqual(expect.objectContaining({ turnCount: 1, toolCount: 1 }));
	});

	test("preserves no-useful-text as a non-complete diagnostic without throwing", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);

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
		const tool = registerTool(pi);

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
		const tool = registerTool(pi);

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
		const tool = registerTool(pi);
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

	test("rejects blank title or prompt before spawning a subagent", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);

		await expect(
			tool.execute("tool-1", { title: "   ", prompt: "Do focused work." }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("non-empty title");
		await expect(tool.execute("tool-2", { title: "Slice subagent", prompt: "\n\t" }, undefined, undefined, { cwd: ROOT })).rejects.toThrow(
			"non-empty prompt",
		);
		expect(runner.calls).toEqual([]);
	});

	test("truncates long final text in model-visible content while preserving machine-readable evidence", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);
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

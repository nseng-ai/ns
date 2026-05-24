import { describe, expect, test } from "bun:test";

import {
	CHILD_SESSION_RUNNER_DEPENDENCIES,
	type ChildSessionPi,
} from "../src/run-child-session.ts";
import type { ChildSessionRunnerDependencies } from "../src/run-child-session/child-process.ts";
import runChildSessionTextExtension, {
	MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS,
	RUN_CHILD_SESSION_TEXT_TOOL_NAME,
	type ExtensionAPI,
	type ToolDefinition,
	type ToolResult,
} from "../src/run-child-session-text.ts";
import { createFakeChildRunner, waitForSpawn } from "./run-child-session-fakes.ts";

const ROOT = "/repo";
const SESSION_FILE = "/tmp/text-child.jsonl";

type JsonSchemaObject = {
	type: string;
	properties?: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
};

class FakePi implements ExtensionAPI, ChildSessionPi {
	readonly tools = new Map<string, ToolDefinition>();
	[CHILD_SESSION_RUNNER_DEPENDENCIES]?: ChildSessionRunnerDependencies;
	[key: string]: unknown;

	constructor(dependencies?: ChildSessionRunnerDependencies) {
		if (dependencies) this[CHILD_SESSION_RUNNER_DEPENDENCIES] = dependencies;
	}

	registerTool(tool: ToolDefinition): void {
		this.tools.set(tool.name, tool);
	}
}

function jsonLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

function registerTool(pi = new FakePi()): ToolDefinition {
	runChildSessionTextExtension(pi);
	const tool = pi.tools.get(RUN_CHILD_SESSION_TEXT_TOOL_NAME);
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

describe("run_child_session_text extension", () => {
	test("registers the custom tool with a strict title/prompt schema", () => {
		const pi = new FakePi();
		const tool = registerTool(pi);
		const schema = tool.parameters as JsonSchemaObject;

		expect(pi.tools.has(RUN_CHILD_SESSION_TEXT_TOOL_NAME)).toBe(true);
		expect(tool.label).toBe("Run Child Session Text");
		expect(tool.description).toContain("final assistant text");
		expect(schema.type).toBe("object");
		expect(Object.keys(schema.properties ?? {}).sort()).toEqual(["prompt", "title"]);
		expect(schema.required).toEqual(["title", "prompt"]);
		expect(schema.additionalProperties).toBe(false);
		expect(tool.promptGuidelines).toHaveLength(3);
		expect(tool.promptGuidelines?.every((guideline) => guideline.includes(RUN_CHILD_SESSION_TEXT_TOOL_NAME))).toBe(true);
	});

	test("passes explicit title, prompt, and current cwd to runChildSession without a runtime extension", async () => {
		const runner = createFakeChildRunner({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);
		const updates: ToolResult[] = [];

		const running = tool.execute(
			"tool-1",
			{ title: "Slice child", prompt: "Do focused work." },
			undefined,
			(partial) => updates.push(partial),
			{ cwd: ROOT },
		);
		const call = await waitForSpawn(runner.calls);

		expect(updates[0]?.content[0]?.text).toBe("Launching child session: Slice child");
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

	test("returns final text, status, session path, progress, and details as an ordinary tool result", async () => {
		let now = 1_000;
		const runner = createFakeChildRunner({ sessionFile: SESSION_FILE, now: () => now });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);

		const running = tool.execute(
			"tool-1",
			{ title: "Slice child", prompt: "Do focused work." },
			undefined,
			undefined,
			{ cwd: ROOT },
		);
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(jsonLine({ type: "tool_execution_start", toolCallId: "tool-a", toolName: "read", args: {} }));
		call.process.emitStdout(jsonLine({ type: "tool_execution_end", toolCallId: "tool-a", toolName: "read", result: {}, isError: false }));
		call.process.emitStdout(finalTextMessage("Child final answer.\nEvidence: test fixture."));
		now = 2_250;
		call.process.close(0);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("run_child_session_text result");
		expect(text).toContain("Status: final-text");
		expect(text).toContain("Child final answer.");
		expect(text).toContain(`Session file: ${SESSION_FILE}`);
		expect(text).toContain("Elapsed: 1.3s; turns: 1; tools: 1");
		expect(details.status).toBe("final-text");
		expect(details.sessionFile).toBe(SESSION_FILE);
		expect(details.finalTextChars).toBe("Child final answer.\nEvidence: test fixture.".length);
		expect(details.finalTextTruncated).toBe(false);
		expect(details.progress).toEqual(expect.objectContaining({ turnCount: 1, toolCount: 1 }));
	});

	test("preserves no-useful-text as a non-complete diagnostic without throwing", async () => {
		const runner = createFakeChildRunner({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);

		const running = tool.execute("tool-1", { title: "Blank child", prompt: "Report back." }, undefined, undefined, { cwd: ROOT });
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(finalTextMessage("   "));
		call.process.close(0);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Status: stopped-without-useful-text");
		expect(text).toContain("Diagnostic: Child Pi stopped without useful final assistant text.");
		expect(text).toContain("Inspect the session file before treating this delegated task as complete.");
		expect(details.status).toBe("stopped-without-useful-text");
		expect(details.diagnostic).toBe("Child Pi stopped without useful final assistant text.");
	});

	test("preserves child error statuses as ordinary diagnostic tool results", async () => {
		const runner = createFakeChildRunner({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);

		const running = tool.execute("tool-1", { title: "Error child", prompt: "Report back." }, undefined, undefined, { cwd: ROOT });
		const call = await waitForSpawn(runner.calls);
		call.process.emitStderr("child failed\n");
		call.process.close(2);

		const result = await running;
		const text = result.content[0]?.text ?? "";
		const details = result.details as Record<string, unknown>;

		expect(text).toContain("Status: error");
		expect(text).toContain("Diagnostic: Child Pi exited with exit code 2.");
		expect(text).toContain("child failed");
		expect(details.status).toBe("error");
		expect(details.sessionFile).toBe(SESSION_FILE);
		expect(details.error).toEqual(expect.objectContaining({ message: expect.stringContaining("Child Pi exited with exit code 2") }));
	});

	test("rejects blank title or prompt before spawning a child", async () => {
		const runner = createFakeChildRunner({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);

		await expect(
			tool.execute("tool-1", { title: "   ", prompt: "Do focused work." }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("non-empty title");
		await expect(tool.execute("tool-2", { title: "Slice child", prompt: "\n\t" }, undefined, undefined, { cwd: ROOT })).rejects.toThrow(
			"non-empty prompt",
		);
		expect(runner.calls).toEqual([]);
	});

	test("truncates long final text in model-visible content while preserving machine-readable evidence", async () => {
		const runner = createFakeChildRunner({ sessionFile: SESSION_FILE });
		const pi = new FakePi(runner.dependencies);
		const tool = registerTool(pi);
		const longText = `${"x".repeat(MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS + 5)}END_UNIQUE`;

		const running = tool.execute("tool-1", { title: "Long child", prompt: "Return a long answer." }, undefined, undefined, { cwd: ROOT });
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

import { exitedResult, ScriptedCommandExecApi } from "@nseng-ai/foundation/exec/testing";
import { describe, expect, test } from "vitest";

import {
	buildClaudeCodeArgs,
	ClaudeCodeStructuredOutputTransport,
	parseClaudeCodeStructuredOutput,
} from "../../src/gateways/claude-code-structured-output.ts";
import { InMemoryCodexStructuredOutputFiles } from "../../src/gateways/codex-structured-output-files.ts";
import {
	buildCodexPrompt,
	CodexStructuredOutputTransport,
} from "../../src/gateways/codex-structured-output.ts";
import {
	RoutingStructuredOutputTransport,
	structuredOutputHarnessLabel,
	type ClaudeCodeStructuredOutputRequest,
	type CodexStructuredOutputRequest,
	type PiStructuredOutputRequest,
	type StructuredOutputRunOptions,
	type StructuredOutputTransportOutcome,
} from "../../src/gateways/structured-output-transport.ts";

const schema: Record<string, unknown> = {
	type: "object",
	properties: { items: { type: "array" } },
	additionalProperties: false,
};

function claudeRequest(
	overrides: Partial<ClaudeCodeStructuredOutputRequest> = {},
): ClaudeCodeStructuredOutputRequest {
	return {
		harness: "claude-code",
		modelId: "claude-sonnet-4-6",
		systemPrompt: "SYSTEM_PROMPT",
		promptText: "PROMPT_TEXT",
		jsonSchema: schema,
		tools: ["Bash", "Read"],
		...overrides,
	};
}

function codexRequest(
	overrides: Partial<CodexStructuredOutputRequest> = {},
): CodexStructuredOutputRequest {
	return {
		harness: "codex",
		modelId: "gpt-5.6-luna",
		systemPrompt: "SYSTEM_PROMPT",
		promptText: "PROMPT_TEXT",
		inputTag: "review-input",
		jsonSchema: schema,
		...overrides,
	};
}

function piRequest(overrides: Partial<PiStructuredOutputRequest> = {}): PiStructuredOutputRequest {
	return {
		harness: "pi",
		modelId: "openai/gpt-5.6-luna",
		systemPrompt: "SYSTEM_PROMPT",
		promptText: "PROMPT_TEXT",
		jsonSchema: schema,
		...overrides,
	};
}

function claudeResultEvent(extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		type: "result",
		structured_output: { items: ["payload"] },
		total_cost_usd: 0.01,
		duration_ms: 123,
		num_turns: 1,
		usage: {
			input_tokens: 10,
			output_tokens: 5,
			cache_creation_input_tokens: 3,
			cache_read_input_tokens: 2,
		},
		...extra,
	};
}

describe("ClaudeCodeStructuredOutputTransport", () => {
	test("resolves the binary and invokes Claude Code with exact protocol argv and prompt on stdin", async () => {
		const execApi = new ScriptedCommandExecApi([
			exitedResult({ stdout: JSON.stringify(claudeResultEvent()) }),
		]);
		const resolved: string[] = [];
		const transport = new ClaudeCodeStructuredOutputTransport({
			execApi,
			binaryResolver: (name) => {
				resolved.push(name);
				return "/usr/bin/claude";
			},
		});
		const signal = new AbortController().signal;
		const env = { ANTHROPIC_API_KEY: "test" };

		const result = await transport.run(claudeRequest(), { cwd: "/repo", env, signal });

		expect(result.ok).toBe(true);
		expect(resolved).toEqual(["claude"]);
		const call = execApi.calls()[0];
		expect(call?.command).toBe("/usr/bin/claude");
		expect(call?.args).toEqual([
			"-p",
			"--output-format",
			"json",
			"--bare",
			"--tools",
			"Bash,Read",
			"--model",
			"claude-sonnet-4-6",
			"--system-prompt",
			"SYSTEM_PROMPT",
			"--json-schema",
			JSON.stringify(schema),
		]);
		expect(call?.options?.stdin).toBe("PROMPT_TEXT");
		expect(call?.options?.cwd).toBe("/repo");
		expect(call?.options?.env).toBe(env);
		expect(call?.options?.signal).toBe(signal);
	});

	test("joins restricted tools for read-only invocations", () => {
		const args = buildClaudeCodeArgs({
			modelId: "claude-sonnet-4-6",
			systemPrompt: "SYSTEM_PROMPT",
			jsonSchema: schema,
			tools: ["Read"],
		});

		expect(args).toContain("Read");
		expect(args).not.toContain("Bash,Read");
	});

	test("parses a single result object into payload and normalized usage", () => {
		const parsed = parseClaudeCodeStructuredOutput(JSON.stringify(claudeResultEvent()));

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value.payload).toEqual({ items: ["payload"] });
			expect(parsed.value.usage).toEqual({
				inputTokens: 10,
				outputTokens: 5,
				cacheCreationInputTokens: 3,
				cacheReadInputTokens: 2,
				totalCostUsd: 0.01,
				durationMs: 123,
				numTurns: 1,
			});
		}
	});

	test("parses an event array by selecting the terminal result event", () => {
		const parsed = parseClaudeCodeStructuredOutput(
			JSON.stringify([{ type: "system" }, claudeResultEvent()]),
		);

		expect(parsed.ok).toBe(true);
		if (parsed.ok) expect(parsed.value.payload).toEqual({ items: ["payload"] });
	});

	test.each([
		{ stdout: "", code: "empty-output" },
		{ stdout: "not json", code: "invalid-json" },
		{ stdout: JSON.stringify(["bad-event", claudeResultEvent()]), code: "invalid-response" },
		{ stdout: JSON.stringify([{ type: "system" }]), code: "invalid-response" },
		{ stdout: JSON.stringify(7), code: "invalid-response" },
		{ stdout: JSON.stringify({ type: "result" }), code: "invalid-response" },
	])("classifies malformed output as $code", ({ stdout, code }) => {
		const parsed = parseClaudeCodeStructuredOutput(stdout);

		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.error.code).toBe(code);
	});

	test("reports prose results with bounded diagnostic text and schema guidance", () => {
		const parsed = parseClaudeCodeStructuredOutput(
			JSON.stringify({ type: "result", result: "x".repeat(600) }),
		);

		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.error.code).toBe("invalid-response");
			expect(parsed.error.message).toContain("Confirm --json-schema is honored");
			expect(parsed.error.message.length).toBeLessThan(650);
		}
	});

	test("malformed usage degrades to null without failing the payload", () => {
		const parsed = parseClaudeCodeStructuredOutput(
			JSON.stringify(claudeResultEvent({ usage: { input_tokens: "bad" } })),
		);

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value.usage).toBeNull();
			expect(parsed.value.payload).toEqual({ items: ["payload"] });
		}
	});

	test("missing binary returns binary-missing without spawning", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const transport = new ClaudeCodeStructuredOutputTransport({
			execApi,
			binaryResolver: () => undefined,
		});

		const result = await transport.run(claudeRequest(), { cwd: "/repo" });

		expect(result).toEqual({
			ok: false,
			error: {
				code: "binary-missing",
				message: "Claude Code binary 'claude' was not found on PATH.",
			},
		});
		expect(execApi.calls()).toEqual([]);
	});

	test("binary resolver failures classify as invocation-failed", async () => {
		const transport = new ClaudeCodeStructuredOutputTransport({
			execApi: new ScriptedCommandExecApi([]),
			binaryResolver: () => {
				throw new Error("resolver broke");
			},
		});

		const result = await transport.run(claudeRequest(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("invocation-failed");
			expect(result.error.message).toContain("resolver broke");
		}
	});

	test("thrown invocation classifies as invocation-failed", async () => {
		const execApi = {
			async exec(): Promise<never> {
				throw new Error("exec exploded");
			},
		};
		const transport = new ClaudeCodeStructuredOutputTransport({
			execApi,
			binaryResolver: () => "/usr/bin/claude",
		});

		const result = await transport.run(claudeRequest(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("invocation-failed");
			expect(result.error.message).toContain("exec exploded");
		}
	});

	test.each([
		{
			label: "spawn failure",
			execResult: {
				type: "spawn-failed" as const,
				stdout: "",
				stderr: "",
				error: "ENOENT",
			},
			code: "invocation-failed",
			message: "ENOENT",
		},
		{
			label: "cancellation",
			execResult: {
				type: "cancelled" as const,
				stdout: "",
				stderr: "",
				code: null,
				signal: "SIGTERM",
			},
			code: "cancelled",
			message: "Claude Code execution was cancelled.",
		},
		{
			label: "timeout",
			execResult: {
				type: "timed-out" as const,
				stdout: "",
				stderr: "",
				code: null,
				signal: null,
			},
			code: "execution-failed",
			message: "Claude Code execution timed out.",
		},
		{
			label: "nonzero exit with stderr precedence",
			execResult: exitedResult({ code: 2, stdout: "last stdout line", stderr: "stderr wins" }),
			code: "execution-failed",
			message: "stderr wins",
		},
		{
			label: "nonzero exit falling back to last stdout line",
			execResult: exitedResult({ code: 2, stdout: "first\nlast stdout line" }),
			code: "execution-failed",
			message: "last stdout line",
		},
	])("classifies $label", async ({ execResult, code, message }) => {
		const execApi = new ScriptedCommandExecApi([execResult]);
		const transport = new ClaudeCodeStructuredOutputTransport({
			execApi,
			binaryResolver: () => "/usr/bin/claude",
		});

		const result = await transport.run(claudeRequest(), { cwd: "/repo" });

		expect(result).toEqual({ ok: false, error: { code, message } });
	});
});

describe("CodexStructuredOutputTransport", () => {
	test("invokes Codex read-only and ephemeral with schema/output files and tagged prompt envelope", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexStructuredOutputFiles({ output: '{"items":[]}' });
		const transport = new CodexStructuredOutputTransport({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});
		const signal = new AbortController().signal;
		const env = { OPENAI_API_KEY: "test" };

		const result = await transport.run(codexRequest(), { cwd: "/repo", env, signal });

		expect(result).toEqual({ ok: true, value: { payload: { items: [] }, usage: null } });
		const call = execApi.calls()[0];
		expect(call?.command).toBe("/usr/bin/codex");
		expect(call?.args).toEqual([
			"exec",
			"--model",
			"gpt-5.6-luna",
			"--sandbox",
			"read-only",
			"--ephemeral",
			"--ignore-user-config",
			"--output-schema",
			"/memory/structured-output.schema.json",
			"--output-last-message",
			"/memory/structured-output.json",
			"--color",
			"never",
			"-",
		]);
		expect(call?.options?.cwd).toBe("/repo");
		expect(call?.options?.env).toBe(env);
		expect(call?.options?.signal).toBe(signal);
		expect(call?.options?.stdin).toContain("<system-instructions>\nSYSTEM_PROMPT");
		expect(call?.options?.stdin).toContain("<review-input>\nPROMPT_TEXT\n</review-input>");
		expect(outputFiles.preparedSchema()).toEqual(schema);
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("wraps prompts in the caller-supplied semantic input tag", () => {
		const prompt = buildCodexPrompt({
			systemPrompt: "SYSTEM_PROMPT",
			promptText: "PROMPT_TEXT",
			inputTag: "aggregation-input",
		});

		expect(prompt.indexOf("<system-instructions>")).toBeLessThan(
			prompt.indexOf("<aggregation-input>"),
		);
		expect(prompt).toContain("<aggregation-input>\nPROMPT_TEXT\n</aggregation-input>");
	});

	test.each([
		{ output: "", code: "empty-output" },
		{ output: "not json", code: "invalid-json" },
	])("classifies unusable output-file content as $code", async ({ output, code }) => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexStructuredOutputFiles({ output });
		const transport = new CodexStructuredOutputTransport({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await transport.run(codexRequest(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe(code);
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("output read failures classify as output-read-failed and still clean up", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexStructuredOutputFiles({
			readError: new Error("missing output"),
		});
		const transport = new CodexStructuredOutputTransport({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await transport.run(codexRequest(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("output-read-failed");
			expect(result.error.message).toContain("missing output");
		}
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("prepare failures classify as invocation-failed without spawning", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexStructuredOutputFiles({
			prepareError: new Error("no temp dir"),
		});
		const transport = new CodexStructuredOutputTransport({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await transport.run(codexRequest(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("invocation-failed");
			expect(result.error.message).toContain("no temp dir");
		}
		expect(execApi.calls()).toEqual([]);
	});

	test("missing binary returns binary-missing without preparing artifacts or spawning", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexStructuredOutputFiles();
		const transport = new CodexStructuredOutputTransport({
			execApi,
			outputFiles,
			binaryResolver: () => undefined,
		});

		const result = await transport.run(codexRequest(), { cwd: "/repo" });

		expect(result).toEqual({
			ok: false,
			error: { code: "binary-missing", message: "Codex binary 'codex' was not found on PATH." },
		});
		expect(outputFiles.preparedSchema()).toBeNull();
		expect(execApi.calls()).toEqual([]);
	});

	test.each([
		{
			label: "nonzero exit with stderr diagnostics",
			execResult: exitedResult({ code: 2, stderr: "codex failed" }),
			code: "execution-failed",
			message: "codex failed",
		},
		{
			label: "cancellation",
			execResult: {
				type: "cancelled" as const,
				stdout: "",
				stderr: "",
				code: null,
				signal: "SIGTERM",
			},
			code: "cancelled",
			message: "Codex execution was cancelled.",
		},
		{
			label: "spawn failure",
			execResult: {
				type: "spawn-failed" as const,
				stdout: "",
				stderr: "",
				error: "ENOENT",
			},
			code: "invocation-failed",
			message: "ENOENT",
		},
	])("classifies $label and still cleans up", async ({ execResult, code, message }) => {
		const execApi = new ScriptedCommandExecApi([execResult]);
		const outputFiles = new InMemoryCodexStructuredOutputFiles();
		const transport = new CodexStructuredOutputTransport({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await transport.run(codexRequest(), { cwd: "/repo" });

		expect(result).toEqual({ ok: false, error: { code, message } });
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("thrown invocation classifies as invocation-failed and still cleans up", async () => {
		const execApi = {
			async exec(): Promise<never> {
				throw new Error("exec exploded");
			},
		};
		const outputFiles = new InMemoryCodexStructuredOutputFiles();
		const transport = new CodexStructuredOutputTransport({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await transport.run(codexRequest(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("invocation-failed");
			expect(result.error.message).toContain("exec exploded");
		}
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("cleanup failure does not mask a completed result", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexStructuredOutputFiles({
			output: '{"items":[]}',
			cleanupError: new Error("cleanup failure"),
		});
		const transport = new CodexStructuredOutputTransport({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await transport.run(codexRequest(), { cwd: "/repo" });

		expect(result).toEqual({ ok: true, value: { payload: { items: [] }, usage: null } });
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("cleanup failure does not hide a primary process failure", async () => {
		const execApi = new ScriptedCommandExecApi([
			exitedResult({ code: 2, stderr: "primary failure" }),
		]);
		const outputFiles = new InMemoryCodexStructuredOutputFiles({
			cleanupError: new Error("cleanup failure"),
		});
		const transport = new CodexStructuredOutputTransport({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await transport.run(codexRequest(), { cwd: "/repo" });

		expect(result).toEqual({
			ok: false,
			error: { code: "execution-failed", message: "primary failure" },
		});
		expect(outputFiles.isCleaned()).toBe(true);
	});
});

describe("RoutingStructuredOutputTransport", () => {
	test("dispatches each request to its harness implementation", async () => {
		const claudeCalls: ClaudeCodeStructuredOutputRequest[] = [];
		const codexCalls: CodexStructuredOutputRequest[] = [];
		const piCalls: PiStructuredOutputRequest[] = [];
		const success: StructuredOutputTransportOutcome = {
			ok: true,
			value: { payload: {}, usage: null },
		};
		const options: StructuredOutputRunOptions = { cwd: "/repo" };
		const transport = new RoutingStructuredOutputTransport({
			claudeCode: {
				async run(request) {
					claudeCalls.push(request);
					return success;
				},
			},
			codex: {
				async run(request) {
					codexCalls.push(request);
					return success;
				},
			},
			pi: {
				async run(request) {
					piCalls.push(request);
					return success;
				},
			},
		});

		await transport.run(claudeRequest(), options);
		await transport.run(codexRequest(), options);
		await transport.run(piRequest(), options);

		expect(claudeCalls).toHaveLength(1);
		expect(claudeCalls[0]?.harness).toBe("claude-code");
		expect(codexCalls).toHaveLength(1);
		expect(codexCalls[0]?.harness).toBe("codex");
		expect(piCalls).toHaveLength(1);
		expect(piCalls[0]?.harness).toBe("pi");
	});

	test("maps harness identifiers to display labels", () => {
		expect(structuredOutputHarnessLabel("claude-code")).toBe("Claude Code");
		expect(structuredOutputHarnessLabel("codex")).toBe("Codex");
		expect(structuredOutputHarnessLabel("pi")).toBe("Pi");
	});
});

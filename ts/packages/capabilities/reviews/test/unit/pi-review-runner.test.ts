import {
	cancelledResult,
	exitedResult,
	ScriptedCommandExecApi,
	spawnFailedResult,
	timedOutResult,
} from "@nseng-ai/foundation/exec/testing";
import { describe, expect, test } from "vitest";

import {
	buildPiArgs,
	parsePiStructuredOutput,
	PiStructuredOutputTransport,
} from "../../src/gateways/pi-structured-output.ts";
import { systemPromptFindingsJsonText } from "../../src/gateways/review-runner-prompt.ts";
import type { PiStructuredOutputRequest } from "../../src/gateways/structured-output-transport.ts";

function request(overrides: Partial<PiStructuredOutputRequest> = {}): PiStructuredOutputRequest {
	return {
		harness: "pi",
		modelId: "openai/gpt-5.6-luna",
		systemPrompt: "Return exactly one JSON object.",
		promptText: "Flag concrete issues.\n\ndiff --git a/src/app.ts b/src/app.ts\n+change\n",
		jsonSchema: { type: "object" },
		...overrides,
	};
}

function transport(
	options: {
		readonly results?: ConstructorParameters<typeof ScriptedCommandExecApi>[0];
		readonly binaryResolver?: () => string | undefined;
	} = {},
): {
	readonly execApi: ScriptedCommandExecApi;
	readonly transport: PiStructuredOutputTransport;
} {
	const execApi = new ScriptedCommandExecApi(
		options.results ?? [exitedResult({ stdout: '{"findings":[]}' })],
	);
	return {
		execApi,
		transport: new PiStructuredOutputTransport({
			execApi,
			binaryResolver: options.binaryResolver ?? (() => "/usr/bin/pi"),
		}),
	};
}

describe("PiStructuredOutputTransport", () => {
	test("invokes the Vercel AI Gateway with isolated read-only tools and prompt on stdin", async () => {
		const harness = transport();
		const signal = new AbortController().signal;
		const env = { AI_GATEWAY_API_KEY: "test" };
		const largePrompt = `UNIQUE_PROMPT_MARKER\n${"x".repeat(200_000)}`;
		const transportRequest = request({ promptText: largePrompt });

		const result = await harness.transport.run(transportRequest, {
			cwd: "/repo",
			env,
			signal,
		});

		expect(result.ok).toBe(true);
		const call = harness.execApi.calls()[0];
		expect(call?.command).toBe("/usr/bin/pi");
		expect(call?.args).toEqual(buildPiArgs(transportRequest));
		expect(call?.args).toEqual([
			"--provider",
			"vercel-ai-gateway",
			"--model",
			"openai/gpt-5.6-luna",
			"--thinking",
			"minimal",
			"--system-prompt",
			"Return exactly one JSON object.",
			"--no-session",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-context-files",
			"--tools",
			"read,bash",
			"--mode",
			"text",
			"--print",
		]);
		expect(systemPromptFindingsJsonText()).toContain(
			'`severity` must be exactly one of `"info"`, `"warning"`, or `"error"`',
		);
		expect(call?.args.some((arg) => arg.includes("UNIQUE_PROMPT_MARKER"))).toBe(false);
		expect(call?.options).toEqual({ cwd: "/repo", stdin: largePrompt, env, signal });
		expect(result).toEqual({
			ok: true,
			value: { payload: { findings: [] }, usage: null },
		});
	});

	test.each([
		[(): undefined => undefined, "binary-missing"],
		[
			(): undefined => {
				throw new Error("resolver broke");
			},
			"invocation-failed",
		],
	] as const)("maps binary resolution failure", async (binaryResolver, code) => {
		const harness = transport({ binaryResolver });

		const result = await harness.transport.run(request(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe(code);
		expect(harness.execApi.calls()).toEqual([]);
	});

	test("maps thrown and spawn invocation failures", async () => {
		const throwingTransport = new PiStructuredOutputTransport({
			execApi: {
				exec: async () => {
					throw new Error("invoke broke");
				},
			},
			binaryResolver: () => "/usr/bin/pi",
		});
		const spawned = transport({ results: [spawnFailedResult("spawn pi ENOENT")] });

		const thrownResult = await throwingTransport.run(request(), { cwd: "/repo" });
		const spawnResult = await spawned.transport.run(request(), { cwd: "/repo" });

		expect(thrownResult).toMatchObject({
			ok: false,
			error: { code: "invocation-failed", message: "Failed to invoke Pi: invoke broke" },
		});
		expect(spawnResult).toEqual({
			ok: false,
			error: { code: "invocation-failed", message: "spawn pi ENOENT" },
		});
	});

	test.each([
		[cancelledResult(), "cancelled", "Pi execution was cancelled."],
		[timedOutResult(), "execution-failed", "Pi execution timed out."],
		[exitedResult({ code: 2 }), "execution-failed", "Pi exited with status 2."],
	] as const)("maps unsuccessful termination", async (execResult, code, message) => {
		const harness = transport({ results: [execResult] });

		const result = await harness.transport.run(request(), { cwd: "/repo" });

		expect(result).toEqual({ ok: false, error: { code, message } });
	});

	test("prefers stderr and then useful stdout diagnostics", async () => {
		const stderrHarness = transport({
			results: [exitedResult({ code: 2, stdout: "stdout", stderr: "stderr wins" })],
		});
		const stdoutHarness = transport({
			results: [exitedResult({ code: 2, stdout: "first\nlast stdout line\n" })],
		});

		const stderrResult = await stderrHarness.transport.run(request(), { cwd: "/repo" });
		const stdoutResult = await stdoutHarness.transport.run(request(), { cwd: "/repo" });

		expect(stderrResult).toMatchObject({ error: { message: "stderr wins" } });
		expect(stdoutResult).toMatchObject({ error: { message: "last stdout line" } });
	});
});

describe("Pi structured output", () => {
	test.each([
		["", "empty-output"],
		["not json", "invalid-json"],
		["{nope}", "invalid-json"],
		['[{"findings":[]}]', "invalid-json"],
		['```ts\n{"findings":[]}\n```', "invalid-json"],
		['first {"findings":[]} second {"findings":[]}', "invalid-json"],
	] as const)("rejects invalid output", (output, code) => {
		const result = parsePiStructuredOutput(output);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe(code);
	});

	test.each([
		['{"findings":[]}', 0],
		['```json\n{"findings":[]}\n```', 0],
		['Review result:\n```json\n{"findings":[]}\n```\nDone.', 0],
		[
			'Before {"findings":[{"path":"src/app.ts","line":1,"severity":"info","summary":"Brace { ok }","details":"Quote: \\"ok\\" and slash: \\\\"}]} after',
			1,
		],
	] as const)("accepts one object", (output, findingCount) => {
		const result = parsePiStructuredOutput(output);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.payload).toMatchObject({
				findings: expect.arrayContaining([]),
			});
			expect((result.value.payload as { findings: unknown[] }).findings).toHaveLength(findingCount);
			expect(result.value.usage).toBeNull();
		}
	});
});

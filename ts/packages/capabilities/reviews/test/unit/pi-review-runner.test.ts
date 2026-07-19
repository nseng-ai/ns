import {
	cancelledResult,
	exitedResult,
	ScriptedCommandExecApi,
	spawnFailedResult,
	timedOutResult,
} from "@nseng-ai/foundation/exec/testing";
import { describe, expect, test } from "vitest";

import type { PreparedReviewHarnessRequest } from "../../src/gateways/review-runner.ts";
import {
	buildPiReviewArgs,
	parsePiReviewOutput,
	PiProcessReviewRunner,
} from "../../src/gateways/pi-review-runner.ts";
import { systemPromptFindingsJsonText } from "../../src/gateways/review-runner-prompt.ts";

function request(
	overrides: Partial<PreparedReviewHarnessRequest> = {},
): PreparedReviewHarnessRequest {
	return {
		modelSelection: {
			provider: "vercel-ai-gateway",
			modelId: "openai/gpt-5.6-luna",
		},
		promptText: "Flag concrete issues.\n\ndiff --git a/src/app.ts b/src/app.ts\n+change\n",
		inputCoverage: {
			fullDiffEstimatedTokens: 10,
			promptDiffTokenCap: 120_000,
			promptDiffFileTokenCap: 40_000,
			changedPathCount: 1,
			includedFileCount: 1,
			omittedFileCount: 0,
			omittedFiles: [],
		},
		...overrides,
	};
}

function runner(
	options: {
		readonly results?: ConstructorParameters<typeof ScriptedCommandExecApi>[0];
		readonly binaryResolver?: () => string | undefined;
	} = {},
): { readonly execApi: ScriptedCommandExecApi; readonly runner: PiProcessReviewRunner } {
	const execApi = new ScriptedCommandExecApi(
		options.results ?? [exitedResult({ stdout: '{"findings":[]}' })],
	);
	return {
		execApi,
		runner: new PiProcessReviewRunner({
			execApi,
			binaryResolver: options.binaryResolver ?? (() => "/usr/bin/pi"),
		}),
	};
}

describe("PiProcessReviewRunner", () => {
	test("invokes the Vercel AI Gateway with isolated read-only tools and prompt on stdin", async () => {
		const harness = runner();
		const signal = new AbortController().signal;
		const env = { AI_GATEWAY_API_KEY: "test" };
		const largePrompt = `UNIQUE_PROMPT_MARKER\n${"x".repeat(200_000)}`;

		const result = await harness.runner.runReview(request({ promptText: largePrompt }), {
			cwd: "/repo",
			env,
			signal,
		});

		expect(result.ok).toBe(true);
		const call = harness.execApi.calls()[0];
		expect(call?.command).toBe("/usr/bin/pi");
		expect(call?.args).toEqual(buildPiReviewArgs("openai/gpt-5.6-luna"));
		expect(call?.args).toEqual([
			"--provider",
			"vercel-ai-gateway",
			"--model",
			"openai/gpt-5.6-luna",
			"--thinking",
			"minimal",
			"--system-prompt",
			systemPromptFindingsJsonText(),
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
	});

	test("returns input coverage and null usage", async () => {
		const harness = runner({
			results: [
				exitedResult({
					stdout:
						'{"findings":[{"path":"src/app.ts","line":1,"severity":"warning","summary":"Issue","details":"Details"}]}',
				}),
			],
		});

		const result = await harness.runner.runReview(request(), { cwd: "/repo" });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.usage).toBeNull();
			expect(result.value.inputCoverage).toMatchObject({ changedPathCount: 1 });
			expect(result.value.payload.findings).toHaveLength(1);
		}
	});

	test.each([
		[(): undefined => undefined, "harness-binary-missing"],
		[
			(): undefined => {
				throw new Error("resolver broke");
			},
			"harness-invocation-failed",
		],
	] as const)("maps binary resolution failure", async (binaryResolver, code) => {
		const harness = runner({ binaryResolver });

		const result = await harness.runner.runReview(request(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe(code);
		expect(harness.execApi.calls()).toEqual([]);
	});

	test("maps thrown and spawn invocation failures", async () => {
		const throwingExecApi = new ScriptedCommandExecApi([]);
		const throwingRunner = new PiProcessReviewRunner({
			execApi: {
				exec: async () => {
					throw new Error("invoke broke");
				},
			},
			binaryResolver: () => "/usr/bin/pi",
		});
		const spawned = runner({ results: [spawnFailedResult("spawn pi ENOENT")] });

		const thrownResult = await throwingRunner.runReview(request(), { cwd: "/repo" });
		const spawnResult = await spawned.runner.runReview(request(), { cwd: "/repo" });

		expect(throwingExecApi.calls()).toEqual([]);
		expect(thrownResult).toMatchObject({
			ok: false,
			error: { code: "harness-invocation-failed", message: "Failed to invoke Pi: invoke broke" },
		});
		expect(spawnResult).toEqual({
			ok: false,
			error: { code: "harness-invocation-failed", message: "spawn pi ENOENT" },
		});
	});

	test.each([
		[cancelledResult(), "review-execution-cancelled", "Pi execution was cancelled."],
		[timedOutResult(), "harness-execution-failed", "Pi execution timed out."],
		[exitedResult({ code: 2 }), "harness-execution-failed", "Pi exited with status 2."],
	] as const)("maps unsuccessful termination", async (execResult, code, message) => {
		const harness = runner({ results: [execResult] });

		const result = await harness.runner.runReview(request(), { cwd: "/repo" });

		expect(result).toEqual({ ok: false, error: { code, message } });
	});

	test("prefers stderr and then useful stdout diagnostics", async () => {
		const stderrHarness = runner({
			results: [exitedResult({ code: 2, stdout: "stdout", stderr: "stderr wins" })],
		});
		const stdoutHarness = runner({
			results: [exitedResult({ code: 2, stdout: "first\nlast stdout line\n" })],
		});

		const stderrResult = await stderrHarness.runner.runReview(request(), { cwd: "/repo" });
		const stdoutResult = await stdoutHarness.runner.runReview(request(), { cwd: "/repo" });

		expect(stderrResult).toMatchObject({ error: { message: "stderr wins" } });
		expect(stdoutResult).toMatchObject({ error: { message: "last stdout line" } });
	});
});

describe("Pi findings output", () => {
	test.each([
		["", "review-execution-empty-output"],
		["not json", "review-execution-invalid-json"],
		["{nope}", "review-execution-invalid-json"],
		['{"findings":"not-an-array"}', "review-execution-invalid-findings"],
		['[{"findings":[]}]', "review-execution-invalid-json"],
		['```ts\n{"findings":[]}\n```', "review-execution-invalid-json"],
		['first {"findings":[]} second {"findings":[]}', "review-execution-invalid-json"],
	] as const)("rejects invalid output", (output, code) => {
		const result = parsePiReviewOutput(output, null);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe(code);
	});

	test.each([
		['{"findings":[]}', 0],
		['```json\n{"findings":[]}\n```', 0],
		['Review result:\n```json\n{"findings":[]}\n```\nDone.', 0],
		[
			'Before {"findings":[{"path":"src/app.ts","line":1,"severity":"info","summary":"Brace { ok }","details":"Quote: \\\"ok\\\" and slash: \\\\"}]} after',
			1,
		],
	] as const)("accepts one findings object", (output, findingCount) => {
		const result = parsePiReviewOutput(output, request().inputCoverage);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.payload.findings).toHaveLength(findingCount);
			expect(result.value.usage).toBeNull();
			expect(result.value.inputCoverage).toMatchObject({ changedPathCount: 1 });
		}
	});
});

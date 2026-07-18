import { exitedResult, ScriptedCommandExecApi } from "@nseng-ai/foundation/exec/testing";
import { describe, expect, test } from "vitest";

import type { PreparedReviewHarnessRequest } from "../../src/gateways/review-runner.ts";
import {
	CodexProcessReviewRunner,
	buildCodexArgs,
	buildCodexPrompt,
	codexReasoningEffort,
	parseCodexReviewOutput,
} from "../../src/gateways/codex-review-runner.ts";
import { InMemoryCodexReviewOutputFiles } from "../../src/gateways/codex-review-output-files.ts";

function request(): PreparedReviewHarnessRequest {
	return {
		modelId: "gpt-5.6-luna",
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
	};
}

describe("Codex review arguments", () => {
	const handle = {
		directoryPath: "/memory",
		schemaPath: "/memory/findings.schema.json",
		outputPath: "/memory/findings.json",
	};

	test.each([
		["off", "none"],
		["minimal", "minimal"],
		["low", "low"],
		["medium", "medium"],
		["high", "high"],
		["xhigh", "xhigh"],
	] as const)("maps shared thinking %s to Codex reasoning effort %s", (thinking, effort) => {
		expect(codexReasoningEffort(thinking)).toBe(effort);
		expect(buildCodexArgs({ modelId: "gpt-5.6-luna", thinking, handle })).toEqual(
			expect.arrayContaining(["--config", `model_reasoning_effort=${JSON.stringify(effort)}`]),
		);
	});

	test("omits reasoning effort when thinking is absent so Codex keeps its default", () => {
		const args = buildCodexArgs({ modelId: "gpt-5.6-luna", handle });

		expect(args).not.toContain("--config");
	});
});

describe("CodexProcessReviewRunner", () => {
	test("invokes Codex read-only and ephemeral with structured output files and prompt on stdin", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexReviewOutputFiles({
			output: '{"findings":[]}',
		});
		const runner = new CodexProcessReviewRunner({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await runner.runReview(request(), {
			cwd: "/repo",
			env: { OPENAI_API_KEY: "test" },
		});

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.usage).toBeNull();
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
			"/memory/findings.schema.json",
			"--output-last-message",
			"/memory/findings.json",
			"--color",
			"never",
			"-",
		]);
		expect(call?.options?.cwd).toBe("/repo");
		expect(call?.options?.stdin).toContain("<system-instructions>");
		expect(call?.options?.stdin).toContain("<review-input>");
		expect(call?.options?.stdin).toContain("Flag concrete issues.");
		expect(outputFiles.preparedSchema()).not.toHaveProperty("$schema");
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("cleans up after process failure and preserves stderr diagnostics", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult({ code: 2, stderr: "codex failed" })]);
		const outputFiles = new InMemoryCodexReviewOutputFiles();
		const runner = new CodexProcessReviewRunner({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await runner.runReview(request(), { cwd: "/repo" });

		expect(result).toEqual({
			ok: false,
			error: { code: "harness-execution-failed", message: "codex failed" },
		});
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("passes configured thinking through Codex's native reasoning effort setting", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexReviewOutputFiles();
		const runner = new CodexProcessReviewRunner({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await runner.runReview({ ...request(), thinking: "xhigh" }, { cwd: "/repo" });

		expect(result.ok).toBe(true);
		expect(execApi.calls()[0]?.args).toEqual(
			expect.arrayContaining(["--config", 'model_reasoning_effort="xhigh"']),
		);
	});

	test("propagates env and cancellation signal and returns input coverage", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexReviewOutputFiles();
		const runner = new CodexProcessReviewRunner({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});
		const signal = new AbortController().signal;
		const env = { OPENAI_API_KEY: "test" };

		const result = await runner.runReview(request(), {
			cwd: "/repo",
			env,
			signal,
		});

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.inputCoverage).not.toBeNull();
		expect(execApi.calls()[0]?.options?.env).toBe(env);
		expect(execApi.calls()[0]?.options?.signal).toBe(signal);
	});

	test("cleans up after output read failure", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexReviewOutputFiles({
			readError: new Error("missing output"),
		});
		const runner = new CodexProcessReviewRunner({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await runner.runReview(request(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toContain("missing output");
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("preserves a successful review when cleanup fails", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexReviewOutputFiles({
			output: '{"findings":[]}',
			cleanupError: new Error("cleanup failure"),
		});
		const runner = new CodexProcessReviewRunner({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await runner.runReview(request(), { cwd: "/repo" });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.payload.findings).toEqual([]);
			expect(result.value.inputCoverage).not.toBeNull();
		}
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("does not hide a primary process failure with a cleanup failure", async () => {
		const execApi = new ScriptedCommandExecApi([
			exitedResult({ code: 2, stderr: "primary failure" }),
		]);
		const outputFiles = new InMemoryCodexReviewOutputFiles({
			cleanupError: new Error("cleanup failure"),
		});
		const runner = new CodexProcessReviewRunner({
			execApi,
			outputFiles,
			binaryResolver: () => "/usr/bin/codex",
		});

		const result = await runner.runReview(request(), { cwd: "/repo" });

		expect(result).toEqual({
			ok: false,
			error: { code: "harness-execution-failed", message: "primary failure" },
		});
		expect(outputFiles.isCleaned()).toBe(true);
	});

	test("missing binary does not prepare artifacts or spawn", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult()]);
		const outputFiles = new InMemoryCodexReviewOutputFiles();
		const runner = new CodexProcessReviewRunner({
			execApi,
			outputFiles,
			binaryResolver: () => undefined,
		});

		const result = await runner.runReview(request(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("harness-binary-missing");
		expect(outputFiles.preparedSchema()).toBeNull();
		expect(execApi.calls()).toEqual([]);
	});
});

describe("Codex structured output", () => {
	test.each([
		["", "review-execution-empty-output"],
		["not json", "review-execution-invalid-json"],
		['{"findings":"not-an-array"}', "review-execution-invalid-findings"],
		['{"message":"prose"}', "review-execution-invalid-findings"],
	] as const)("rejects invalid output as %s", (output, code) => {
		const result = parseCodexReviewOutput(output, null);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe(code);
	});

	test("combines system and review prompts deterministically", () => {
		const prompt = buildCodexPrompt("REVIEW_MARKER");

		expect(prompt.indexOf("<system-instructions>")).toBeLessThan(prompt.indexOf("<review-input>"));
		expect(prompt).toContain("REVIEW_MARKER");
	});
});

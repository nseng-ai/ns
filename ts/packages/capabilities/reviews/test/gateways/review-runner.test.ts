import { describe, expect, test } from "vitest";
import { exitedResult, ScriptedCommandExecApi } from "@nseng-ai/foundation/exec/testing";

import {
	FakeReviewRunnerGateway,
	ClaudeCodeProcessReviewRunner,
	RoutingReviewRunner,
	type PreparedReviewHarnessRequest,
	type ReviewHarnessRunner,
	type RunReviewOptions,
} from "../../src/gateways/review-runner.ts";
import type { ReviewResult } from "../../src/core/failures.ts";
import { buildReviewFindingsJsonSchema } from "../../src/gateways/review-findings-output.ts";
import {
	createFindingsReview,
	createLocalDiff,
	type ReviewRunnerRequest,
	type ReviewExecutionResponse,
} from "../../src/core/models.ts";

function request(
	options: {
		readonly model?: string;
		readonly reviewName?: string;
		readonly diffText?: string;
	} = {},
): ReviewRunnerRequest {
	const diffText = options.diffText ?? "diff --git a/src/app.ts b/src/app.ts\n+change\n";
	return {
		model: options.model ?? "anthropic/claude-haiku-4-5",
		reviewDefinition: {
			name: options.reviewName ?? "typescript-style",
			description: "Review TypeScript diffs.",
			instructions: "Flag concrete issues.",
			modelProfile: "quick",
			applicability: { include: ["**/*.ts"], exclude: [] },
			localOnly: false,
		},
		reviewDir: "/repo/.ns/reviews/typescript-style",
		target: {
			localDiff: createLocalDiff({
				baseRef: "main",
				diffText,
				files: [
					{
						path: "src/app.ts",
						oldPath: null,
						changeKind: "modified",
						rawText: diffText,
						isBinary: false,
						addedLines: 1,
						removedLines: 0,
						hunkCount: 1,
						byteSize: diffText.length,
						estimatedTokens: 10,
					},
				],
			}),
		},
	};
}

function successResponse(): ReviewExecutionResponse {
	return { payload: createFindingsReview([]), usage: null, inputCoverage: null };
}

function preparedRequest(
	options: { readonly modelId?: string; readonly promptText?: string } = {},
): PreparedReviewHarnessRequest {
	return {
		modelId: options.modelId ?? "claude-haiku-4-5",
		promptText: options.promptText ?? "REVIEW_PROMPT",
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

function claudeStdout(): string {
	return JSON.stringify({ type: "result", structured_output: { findings: [] } });
}

class RecordingHarnessRunner implements ReviewHarnessRunner {
	readonly calls: Array<{
		request: PreparedReviewHarnessRequest;
		options: RunReviewOptions;
	}> = [];

	async runReview(
		request: PreparedReviewHarnessRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		this.calls.push({ request, options });
		return { ok: true, value: successResponse() };
	}
}

describe("FakeReviewRunnerGateway", () => {
	test("returns default empty findings and records immutable request copies", async () => {
		const gateway = new FakeReviewRunnerGateway();
		const reviewRequest = request();

		const result = await gateway.runReview(reviewRequest, { cwd: "/repo", env: { A: "1" } });
		reviewRequest.target.localDiff.changedPaths.push("mutated.ts");

		expect(result).toEqual({ ok: true, value: successResponse() });
		expect(gateway.calls()[0]?.request.target.localDiff.changedPaths).toEqual(["src/app.ts"]);
		expect(gateway.calls()[0]?.options.env).toEqual({ A: "1" });
	});

	test("returns configured results by review name without sharing mutable response state", async () => {
		const configured: ReviewExecutionResponse = {
			payload: createFindingsReview([
				{ path: "src/app.ts", line: 1, severity: "info", summary: "A", details: "B" },
			]),
			usage: null,
			inputCoverage: null,
		};
		const gateway = new FakeReviewRunnerGateway({
			resultsByReviewName: { custom: { ok: true, value: configured } },
		});

		const first = await gateway.runReview(request({ reviewName: "custom" }), { cwd: "/repo" });
		if (first.ok)
			first.value.payload.findings.push({
				path: "other.ts",
				line: null,
				severity: "warning",
				summary: "C",
				details: "D",
			});
		const second = await gateway.runReview(request({ reviewName: "custom" }), { cwd: "/repo" });

		expect(second.ok).toBe(true);
		if (second.ok) {
			expect(second.value.payload.findings).toHaveLength(1);
		}
	});

	test("accepts configured results from Map input", async () => {
		const configured: ReviewExecutionResponse = {
			payload: createFindingsReview([
				{ path: "src/app.ts", line: 1, severity: "info", summary: "A", details: "B" },
			]),
			usage: null,
			inputCoverage: null,
		};
		const gateway = new FakeReviewRunnerGateway({
			resultsByReviewName: new Map([["custom", { ok: true, value: configured }]]),
		});

		const result = await gateway.runReview(request({ reviewName: "custom" }), { cwd: "/repo" });

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.payload.findings).toHaveLength(1);
	});
});

describe("ClaudeCodeProcessReviewRunner", () => {
	test("resolves claude before spawning and invokes Claude Code with prompt on stdin", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult({ stdout: claudeStdout() })]);
		const resolved: string[] = [];
		const gateway = new ClaudeCodeProcessReviewRunner({
			execApi,
			binaryResolver: (name) => {
				resolved.push(name);
				return "/usr/bin/claude";
			},
		});
		const largeMarker = "UNIQUE_PROMPT_MARKER";
		const harnessRequest = preparedRequest({
			promptText: `${largeMarker}\n${"x".repeat(200_000)}`,
		});

		const result = await gateway.runReview(harnessRequest, { cwd: "/repo" });

		expect(result.ok).toBe(true);
		expect(resolved).toEqual(["claude"]);
		const call = execApi.calls()[0];
		expect(call?.command).toBe("/usr/bin/claude");
		expect(call?.args.slice(0, 8)).toEqual([
			"-p",
			"--output-format",
			"json",
			"--bare",
			"--tools",
			"Bash,Read",
			"--model",
			"claude-haiku-4-5",
		]);
		expect(call?.args[6]).toBe("--model");
		expect(call?.args).toContain("--system-prompt");
		expect(call?.args).toContain("--json-schema");
		const schemaArg = call?.args.at((call?.args.indexOf("--json-schema") ?? -2) + 1);
		expect(schemaArg).toBeDefined();
		if (schemaArg !== undefined) {
			expect(JSON.parse(schemaArg)).toEqual(buildReviewFindingsJsonSchema());
			expect(JSON.parse(schemaArg)).not.toHaveProperty("$schema");
		}
		expect(call?.args.join(" ")).not.toContain("Edit");
		expect(call?.args.join(" ")).not.toContain("Write");
		expect(call?.args).not.toContain("--verbose");
		expect(call?.args).not.toContain("--append-system-prompt");
		expect(call?.args.some((arg) => arg.includes(largeMarker))).toBe(false);
		expect(call?.options?.stdin).toContain(largeMarker);
		expect(call?.options?.cwd).toBe("/repo");
	});

	test("missing binary returns harness_binary_missing without spawning", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult({ stdout: claudeStdout() })]);
		const gateway = new ClaudeCodeProcessReviewRunner({ execApi, binaryResolver: () => undefined });

		const result = await gateway.runReview(preparedRequest(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("harness-binary-missing");
		expect(execApi.calls()).toEqual([]);
	});

	test("non-zero exit maps to harness_execution_failed with stderr precedence", async () => {
		const execApi = new ScriptedCommandExecApi([
			exitedResult({ stdout: "last stdout line", stderr: "stderr wins", code: 2 }),
		]);
		const gateway = new ClaudeCodeProcessReviewRunner({
			execApi,
			binaryResolver: () => "/usr/bin/claude",
		});

		const result = await gateway.runReview(preparedRequest(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("harness-execution-failed");
			expect(result.error.message).toBe("stderr wins");
		}
	});

	test("successful stdout returns input coverage", async () => {
		const execApi = new ScriptedCommandExecApi([exitedResult({ stdout: claudeStdout() })]);
		const gateway = new ClaudeCodeProcessReviewRunner({
			execApi,
			binaryResolver: () => "/usr/bin/claude",
		});

		const result = await gateway.runReview(preparedRequest(), { cwd: "/repo" });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.inputCoverage).toMatchObject({
				changedPathCount: 1,
				includedFileCount: 1,
				omittedFileCount: 0,
			});
		}
	});
});

describe("RoutingReviewRunner", () => {
	test.each([
		["anthropic/claude-sonnet-4-6", "claude-code", "claude-sonnet-4-6"],
		["openai/gpt-5.6-luna", "codex", "gpt-5.6-luna"],
		["openai-codex/gpt-5.6-terra", "codex", "gpt-5.6-terra"],
		["vercel-ai-gateway/openai/gpt-5.6-luna", "pi", "openai/gpt-5.6-luna"],
	] as const)("routes %s to %s with only the model ID", async (model, harness, modelId) => {
		const claudeCode = new RecordingHarnessRunner();
		const codex = new RecordingHarnessRunner();
		const pi = new RecordingHarnessRunner();
		const runner = new RoutingReviewRunner({ claudeCode, codex, pi });

		const result = await runner.runReview(request({ model }), { cwd: "/repo" });

		expect(result.ok).toBe(true);
		expect(claudeCode.calls).toHaveLength(harness === "claude-code" ? 1 : 0);
		expect(codex.calls).toHaveLength(harness === "codex" ? 1 : 0);
		expect(pi.calls).toHaveLength(harness === "pi" ? 1 : 0);
		const dispatched =
			harness === "claude-code"
				? claudeCode.calls[0]
				: harness === "codex"
					? codex.calls[0]
					: pi.calls[0];
		expect(dispatched?.request.modelId).toBe(modelId);
		expect(dispatched?.request.promptText).toContain("Flag concrete issues.");
		expect(dispatched?.request.promptText).toContain("+change");
		expect(dispatched?.request.inputCoverage).toMatchObject({
			changedPathCount: 1,
			includedFileCount: 1,
			omittedFileCount: 0,
		});
	});

	test.each([
		"haiku",
		"google/gemini-3-pro",
		"acme/gpt-5.6-luna",
		"/missing-provider",
		"openai//gpt-5.6-luna",
	])("rejects unsupported reference %s without dispatching", async (model) => {
		const claudeCode = new RecordingHarnessRunner();
		const codex = new RecordingHarnessRunner();
		const pi = new RecordingHarnessRunner();
		const runner = new RoutingReviewRunner({ claudeCode, codex, pi });

		const result = await runner.runReview(request({ model }), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("model-not-supported-by-harness");
		expect(claudeCode.calls).toEqual([]);
		expect(codex.calls).toEqual([]);
		expect(pi.calls).toEqual([]);
	});
});

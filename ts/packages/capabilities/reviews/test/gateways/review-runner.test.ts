import { describe, expect, test } from "vitest";

import { FakeReviewRunnerGateway, RoutingReviewRunner } from "../../src/gateways/review-runner.ts";
import { buildReviewFindingsJsonSchema } from "../../src/gateways/review-findings-output.ts";
import type {
	StructuredOutputHarnessRequest,
	StructuredOutputRunOptions,
	StructuredOutputTransport,
	StructuredOutputTransportFailureCode,
	StructuredOutputTransportOutcome,
} from "../../src/gateways/structured-output-transport.ts";
import {
	createFindingsReview,
	createLocalDiff,
	type ReviewRunnerRequest,
	type ReviewExecutionResponse,
	type ReviewUsage,
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
			modelProfile: "fast",
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

function usage(): ReviewUsage {
	return {
		inputTokens: 10,
		outputTokens: 5,
		cacheCreationInputTokens: 3,
		cacheReadInputTokens: 2,
		totalCostUsd: 0.01,
		durationMs: 123,
		numTurns: 1,
	};
}

class RecordingStructuredOutputTransport implements StructuredOutputTransport {
	readonly calls: Array<{
		request: StructuredOutputHarnessRequest;
		options: StructuredOutputRunOptions;
	}> = [];
	private readonly outcome: StructuredOutputTransportOutcome;

	constructor(
		outcome: StructuredOutputTransportOutcome = {
			ok: true,
			value: { payload: { findings: [] }, usage: null },
		},
	) {
		this.outcome = outcome;
	}

	async run(
		request: StructuredOutputHarnessRequest,
		options: StructuredOutputRunOptions,
	): Promise<StructuredOutputTransportOutcome> {
		this.calls.push({ request, options });
		return this.outcome;
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

describe("RoutingReviewRunner", () => {
	test("builds a Claude Code review transport request with review tools and schema", async () => {
		const transport = new RecordingStructuredOutputTransport();
		const runner = new RoutingReviewRunner({ transport });
		const signal = new AbortController().signal;
		const env = { ANTHROPIC_API_KEY: "test" };

		const result = await runner.runReview(request({ model: "anthropic/claude-sonnet-4-6" }), {
			cwd: "/repo",
			env,
			signal,
		});

		expect(result.ok).toBe(true);
		const dispatched = transport.calls[0];
		expect(dispatched?.request.harness).toBe("claude-code");
		expect(dispatched?.request.modelId).toBe("claude-sonnet-4-6");
		if (dispatched?.request.harness === "claude-code") {
			expect(dispatched.request.tools).toEqual(["Bash", "Read"]);
		}
		expect(dispatched?.request.jsonSchema).toEqual(buildReviewFindingsJsonSchema());
		expect(dispatched?.request.jsonSchema).not.toHaveProperty("$schema");
		expect(dispatched?.request.systemPrompt).not.toBe("");
		expect(dispatched?.request.promptText).toContain("Flag concrete issues.");
		expect(dispatched?.request.promptText).toContain("+change");
		expect(dispatched?.options.cwd).toBe("/repo");
		expect(dispatched?.options.env).toBe(env);
		expect(dispatched?.options.signal).toBe(signal);
	});

	test.each([
		["openai/gpt-5.6-luna", "gpt-5.6-luna"],
		["openai-codex/gpt-5.6-terra", "gpt-5.6-terra"],
	] as const)("builds a Codex review transport request for %s", async (model, modelId) => {
		const transport = new RecordingStructuredOutputTransport();
		const runner = new RoutingReviewRunner({ transport });

		const result = await runner.runReview(request({ model }), { cwd: "/repo" });

		expect(result.ok).toBe(true);
		const dispatched = transport.calls[0];
		expect(dispatched?.request.harness).toBe("codex");
		expect(dispatched?.request.modelId).toBe(modelId);
		if (dispatched?.request.harness === "codex") {
			expect(dispatched.request.inputTag).toBe("review-input");
		}
		expect(dispatched?.request.jsonSchema).toEqual(buildReviewFindingsJsonSchema());
	});

	test("attaches input coverage and transport usage to validated findings", async () => {
		const transport = new RecordingStructuredOutputTransport({
			ok: true,
			value: { payload: { findings: [] }, usage: usage() },
		});
		const runner = new RoutingReviewRunner({ transport });

		const result = await runner.runReview(request(), { cwd: "/repo" });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.usage).toEqual(usage());
			expect(result.value.inputCoverage).toMatchObject({
				changedPathCount: 1,
				includedFileCount: 1,
				omittedFileCount: 0,
			});
		}
	});

	test("builds a Pi review transport request for a Vercel AI Gateway model", async () => {
		const transport = new RecordingStructuredOutputTransport();
		const runner = new RoutingReviewRunner({ transport });

		const result = await runner.runReview(
			request({ model: "vercel-ai-gateway/openai/gpt-5.6-luna" }),
			{ cwd: "/repo" },
		);

		expect(result.ok).toBe(true);
		const dispatched = transport.calls[0];
		expect(dispatched?.request.harness).toBe("pi");
		expect(dispatched?.request.modelId).toBe("openai/gpt-5.6-luna");
		expect(dispatched?.request.systemPrompt).toContain("Return exactly one JSON object");
		expect(dispatched?.request.jsonSchema).toEqual(buildReviewFindingsJsonSchema());
		expect(dispatched?.request.promptText).toContain("Flag concrete issues.");
		expect(dispatched?.request.promptText).toContain("+change");
	});

	test.each([
		"haiku",
		"google/gemini-3-pro",
		"acme/gpt-5.6-luna",
		"/missing-provider",
		"openai//gpt-5.6-luna",
	])("rejects unsupported reference %s without dispatching", async (model) => {
		const transport = new RecordingStructuredOutputTransport();
		const runner = new RoutingReviewRunner({ transport });

		const result = await runner.runReview(request({ model }), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("model-not-supported-by-harness");
		expect(transport.calls).toEqual([]);
	});

	test.each([
		["binary-missing", "harness-binary-missing"],
		["invocation-failed", "harness-invocation-failed"],
		["execution-failed", "harness-execution-failed"],
		["cancelled", "review-execution-cancelled"],
		["empty-output", "review-execution-empty-output"],
		["output-read-failed", "review-execution-empty-output"],
		["invalid-json", "review-execution-invalid-json"],
		["invalid-response", "review-execution-invalid-response"],
	] as const satisfies readonly (readonly [StructuredOutputTransportFailureCode, string])[])(
		"maps transport failure %s to review failure %s",
		async (transportCode, reviewCode) => {
			const transport = new RecordingStructuredOutputTransport({
				ok: false,
				error: { code: transportCode, message: "transport diagnostics" },
			});
			const runner = new RoutingReviewRunner({ transport });

			const result = await runner.runReview(request(), { cwd: "/repo" });

			expect(result).toEqual({
				ok: false,
				error: { code: reviewCode, message: "transport diagnostics" },
			});
		},
	);

	test("maps payloads that fail findings validation to invalid findings with the harness label", async () => {
		const transport = new RecordingStructuredOutputTransport({
			ok: true,
			value: { payload: { findings: "not-an-array" }, usage: null },
		});
		const runner = new RoutingReviewRunner({ transport });

		const result = await runner.runReview(request(), { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("review-execution-invalid-findings");
			expect(result.error.message).toContain("Claude Code");
		}
	});
});

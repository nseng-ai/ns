import { describe, expect, it } from "vitest";

import {
	FakeReviewAggregationRunnerGateway,
	RoutingReviewAggregationRunner,
} from "../../src/gateways/review-aggregation-runner.ts";
import { buildReviewAggregationJsonSchema } from "../../src/gateways/review-aggregation-output.ts";
import type {
	StructuredOutputHarnessRequest,
	StructuredOutputRunOptions,
	StructuredOutputTransport,
	StructuredOutputTransportFailureCode,
	StructuredOutputTransportOutcome,
} from "../../src/gateways/structured-output-transport.ts";
import type { ReviewAggregationRunnerRequest } from "../../src/core/models.ts";

const finding = {
	reviewKey: "correctness",
	occurrence: 0,
	path: "src/a.ts",
	line: 1,
	severity: "error" as const,
	summary: "Issue",
	details: "Details",
};
const request: ReviewAggregationRunnerRequest = {
	model: "anthropic/claude-sonnet-4-6",
	rosterResult: {
		revisionRange: "main...HEAD",
		ranAt: "2026-07-16T12:00:00.000Z",
		entries: [
			{
				reviewKey: "correctness",
				position: 0,
				state: "completed",
				modelProfile: "deep",
				model: "anthropic/claude-sonnet-4-6",
				findings: [finding],
				usage: null,
				inputCoverage: null,
			},
		],
		findings: [finding],
	},
	constraints: { mustGroup: [], mustSeparate: [] },
};
const emptyProposal = {
	clusters: [],
};

class RecordingStructuredOutputTransport implements StructuredOutputTransport {
	readonly calls: Array<{
		request: StructuredOutputHarnessRequest;
		options: StructuredOutputRunOptions;
	}> = [];
	private readonly outcome: StructuredOutputTransportOutcome;

	constructor(
		outcome: StructuredOutputTransportOutcome = {
			ok: true,
			value: { payload: emptyProposal, usage: null },
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

describe("RoutingReviewAggregationRunner", () => {
	it("builds a read-only Claude Code aggregation transport request", async () => {
		const transport = new RecordingStructuredOutputTransport();
		const runner = new RoutingReviewAggregationRunner({ transport });
		const signal = new AbortController().signal;
		const env = { ANTHROPIC_API_KEY: "test" };

		const result = await runner.runAggregation(request, { cwd: "/repo", env, signal });

		expect(result).toEqual({ ok: true, value: { payload: emptyProposal, usage: null } });
		const dispatched = transport.calls[0];
		expect(dispatched?.request.harness).toBe("claude-code");
		expect(dispatched?.request.modelId).toBe("claude-sonnet-4-6");
		if (dispatched?.request.harness === "claude-code") {
			expect(dispatched.request.tools).toEqual(["Read"]);
		}
		expect(dispatched?.request.jsonSchema).toEqual(buildReviewAggregationJsonSchema());
		expect(dispatched?.request.systemPrompt).toContain("aggregate source-attributed review");
		expect(JSON.parse(dispatched?.request.promptText ?? "{}")).toMatchObject({
			revisionRange: "main...HEAD",
			findings: [finding],
		});
		expect(dispatched?.options.cwd).toBe("/repo");
		expect(dispatched?.options.env).toBe(env);
		expect(dispatched?.options.signal).toBe(signal);
	});

	it("builds a Codex aggregation transport request with the aggregation input tag", async () => {
		const transport = new RecordingStructuredOutputTransport();
		const runner = new RoutingReviewAggregationRunner({ transport });

		const result = await runner.runAggregation(
			{ ...request, model: "openai/gpt-5.6-terra" },
			{ cwd: "/repo" },
		);

		expect(result.ok).toBe(true);
		const dispatched = transport.calls[0];
		expect(dispatched?.request.harness).toBe("codex");
		expect(dispatched?.request.modelId).toBe("gpt-5.6-terra");
		if (dispatched?.request.harness === "codex") {
			expect(dispatched.request.inputTag).toBe("aggregation-input");
		}
		expect(dispatched?.request.jsonSchema).toEqual(buildReviewAggregationJsonSchema());
	});

	it("rejects unsupported providers honestly without dispatching", async () => {
		const transport = new RecordingStructuredOutputTransport();
		const runner = new RoutingReviewAggregationRunner({ transport });

		const result = await runner.runAggregation(
			{ ...request, model: "vercel-ai-gateway/model" },
			{ cwd: "/repo" },
		);

		expect(result).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-model-resolution-failed" },
		});
		expect(transport.calls).toEqual([]);
	});

	it.each([
		["binary-missing", "review-aggregation-invocation-failed"],
		["invocation-failed", "review-aggregation-invocation-failed"],
		["execution-failed", "review-aggregation-invocation-failed"],
		["output-read-failed", "review-aggregation-invocation-failed"],
		["cancelled", "review-aggregation-cancelled"],
		["empty-output", "review-aggregation-invalid-output"],
		["invalid-response", "review-aggregation-invalid-output"],
		["invalid-json", "review-aggregation-invalid-json"],
	] as const satisfies readonly (readonly [StructuredOutputTransportFailureCode, string])[])(
		"maps transport failure %s to aggregation failure %s",
		async (transportCode, aggregationCode) => {
			const transport = new RecordingStructuredOutputTransport({
				ok: false,
				error: { code: transportCode, message: "transport diagnostics" },
			});
			const runner = new RoutingReviewAggregationRunner({ transport });

			const result = await runner.runAggregation(request, { cwd: "/repo" });

			expect(result).toEqual({
				ok: false,
				error: { code: aggregationCode, message: "transport diagnostics" },
			});
		},
	);

	it("maps payloads that fail proposal validation to invalid output with the harness label", async () => {
		const transport = new RecordingStructuredOutputTransport({
			ok: true,
			value: { payload: { clusters: [{ findings: [] }] }, usage: null },
		});
		const runner = new RoutingReviewAggregationRunner({ transport });

		const result = await runner.runAggregation(request, { cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("review-aggregation-invalid-output");
			expect(result.error.message).toContain("Claude Code");
		}
	});

	it("attaches normalized transport usage to the validated aggregation response", async () => {
		const usage = {
			inputTokens: 10,
			outputTokens: 5,
			cacheCreationInputTokens: 3,
			cacheReadInputTokens: 2,
			totalCostUsd: 0.01,
			durationMs: 123,
			numTurns: 1,
		};
		const transport = new RecordingStructuredOutputTransport({
			ok: true,
			value: { payload: emptyProposal, usage },
		});
		const runner = new RoutingReviewAggregationRunner({ transport });

		const result = await runner.runAggregation(request, { cwd: "/repo" });

		expect(result).toEqual({ ok: true, value: { payload: emptyProposal, usage } });
	});
});

describe("FakeReviewAggregationRunnerGateway", () => {
	it("copies requests and results", async () => {
		const fake = new FakeReviewAggregationRunnerGateway();
		await fake.runAggregation(request, { cwd: "/repo", env: { TOKEN: "secret" } });
		const call = fake.calls()[0];
		expect(call?.request).toEqual(request);
		call?.request.rosterResult.findings.splice(0);
		expect(fake.calls()[0]?.request.rosterResult.findings).toEqual([finding]);
	});
});

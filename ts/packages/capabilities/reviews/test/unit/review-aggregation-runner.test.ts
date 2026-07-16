import { describe, expect, it } from "vitest";
import { ScriptedCommandExecApi } from "@nseng-ai/foundation/exec/testing";

import {
	ClaudeCodeProcessReviewAggregationRunner,
	FakeReviewAggregationRunnerGateway,
	RoutingReviewAggregationRunner,
} from "../../src/gateways/review-aggregation-runner.ts";
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

describe("review aggregation runners", () => {
	it("routes supported providers and rejects unsupported providers honestly", async () => {
		const claudeCalls: unknown[] = [];
		const codexCalls: unknown[] = [];
		const success = { ok: true as const, value: { payload: { clusters: [] }, usage: null } };
		const runner = new RoutingReviewAggregationRunner({
			claudeCode: {
				async runAggregation(prepared) {
					claudeCalls.push(prepared);
					return success;
				},
			},
			codex: {
				async runAggregation(prepared) {
					codexCalls.push(prepared);
					return success;
				},
			},
		});
		await runner.runAggregation(request, { cwd: "/repo" });
		expect(claudeCalls).toHaveLength(1);
		expect(codexCalls).toHaveLength(0);
		expect(
			await runner.runAggregation(
				{ ...request, model: "vercel-ai-gateway/model" },
				{ cwd: "/repo" },
			),
		).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-model-resolution-failed" },
		});
	});

	it("the fake copies requests and results", async () => {
		const fake = new FakeReviewAggregationRunnerGateway();
		await fake.runAggregation(request, { cwd: "/repo", env: { TOKEN: "secret" } });
		const call = fake.calls()[0];
		expect(call?.request).toEqual(request);
		call?.request.rosterResult.findings.splice(0);
		expect(fake.calls()[0]?.request.rosterResult.findings).toEqual([finding]);
	});

	it("invokes Claude read-only with exact structured schema and translates cancellation", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				type: "cancelled",
				stdout: "",
				stderr: "cancelled",
				code: null,
				signal: "SIGTERM",
			},
		]);
		const runner = new ClaudeCodeProcessReviewAggregationRunner({
			execApi,
			binaryResolver: () => "/bin/claude",
		});
		const result = await runner.runAggregation(
			{ modelId: "claude-sonnet-4-6", promptText: "input" },
			{ cwd: "/repo" },
		);
		expect(result).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-cancelled" },
		});
		const invocation = execApi.calls()[0];
		expect(invocation?.args).toContain("--json-schema");
		expect(invocation?.args).toContain("Read");
		expect(invocation?.args).not.toContain("Bash,Read");
		expect(invocation?.options?.stdin).toBe("input");
	});
});

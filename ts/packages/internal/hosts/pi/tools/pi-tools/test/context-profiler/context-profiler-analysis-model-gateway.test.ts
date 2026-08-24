import { describe, expect, test } from "vitest";

import type { AssistantMessage, Context, SimpleStreamOptions, Usage } from "@earendil-works/pi-ai";
// Temporary while Pi Coding Agent's ModelRegistry uses global dispatch.
// Canonical migration plan (Phase 9): https://github.com/earendil-works/pi/blob/main/packages/agent/docs/models.md
import type { completeSimple } from "@earendil-works/pi-ai/compat";
import {
	createExplicitModelExecutionSelection,
	type ModelExecutionCoordinator,
} from "@nseng-ai/extension-kit/model-execution";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { EPISODE_ANALYSIS_SYSTEM_PROMPT } from "../../src/context-profiler/analysis.ts";
import {
	createAnalysisModelGateway,
	type AnalysisModelRegistry,
} from "../../src/context-profiler/analysis-model-gateway.ts";
import { SEGMENTATION_SYSTEM_PROMPT } from "../../src/context-profiler/segmentation.ts";

type CompleteSimpleFunction = typeof completeSimple;

const SEGMENTATION_SELECTION: ModelSelection = {
	provider: "segmentation-provider",
	modelId: "segmentation-model",
	thinking: "medium",
};
const EPISODE_ANALYSIS_SELECTION: ModelSelection = {
	provider: "analysis-provider",
	modelId: "analysis-model",
	thinking: "high",
};
const SEGMENTATION_EXECUTION_SELECTION =
	createExplicitModelExecutionSelection(SEGMENTATION_SELECTION);
const EPISODE_ANALYSIS_EXECUTION_SELECTION = createExplicitModelExecutionSelection(
	EPISODE_ANALYSIS_SELECTION,
);
const MODEL_EXECUTION_COORDINATOR: ModelExecutionCoordinator = { beforeExecution() {} };
const MODEL_TOKENS = new Map([
	["segmentation-provider/segmentation-model", { id: "segmentation-token" }],
	["analysis-provider/analysis-model", { id: "analysis-token" }],
]);

interface FakeRegistryState {
	missingRef?: string;
	auth?:
		| { ok: true; apiKey?: string; headers?: Record<string, string> }
		| { ok: false; error: string };
}

function makeRegistry(state: FakeRegistryState = {}): AnalysisModelRegistry {
	return {
		find(provider, modelId) {
			const ref = `${provider}/${modelId}`;
			if (state.missingRef === ref) return undefined;
			return MODEL_TOKENS.get(ref);
		},
		getApiKeyAndHeaders(model) {
			expect([...MODEL_TOKENS.values()]).toContain(model);
			return Promise.resolve(state.auth ?? { ok: true, apiKey: "key" });
		},
	};
}

const ZERO_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeResponse(
	overrides: Partial<Pick<AssistantMessage, "stopReason" | "errorMessage" | "content">>,
): AssistantMessage {
	return {
		role: "assistant",
		api: "fake-api",
		provider: "fake-provider",
		model: "fake-model",
		usage: ZERO_USAGE,
		timestamp: 0,
		stopReason: "stop",
		content: [],
		...overrides,
	};
}

function completeWith(response: AssistantMessage): CompleteSimpleFunction {
	return (() => Promise.resolve(response)) as CompleteSimpleFunction;
}

function createGateway(
	registry: AnalysisModelRegistry = makeRegistry(),
	overrides: { completeFn?: CompleteSimpleFunction } = {},
) {
	return createAnalysisModelGateway({
		registry,
		segmentationSelection: SEGMENTATION_EXECUTION_SELECTION,
		episodeAnalysisSelection: EPISODE_ANALYSIS_EXECUTION_SELECTION,
		modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
		...overrides,
	});
}

const VALID_SEGMENTATION = JSON.stringify({
	episodes: [{ startTurn: 1, label: "a", kind: "chat", outcome: "active" }],
	summary: "One sentence.",
});
const VALID_ANALYSIS = JSON.stringify({
	efficiency: "mixed",
	relevance: "stale",
	summary: "t1 re-reads superseded docs.",
});
const REQUEST = { json: '{"turns":[]}' };

function signal(): AbortSignal {
	return new AbortController().signal;
}

describe("createAnalysisModelGateway", () => {
	test("exposes separate qualified producer references", () => {
		const gateway = createGateway();
		expect(gateway.segmentationModel).toBe("segmentation-provider/segmentation-model");
		expect(gateway.episodeAnalysisModel).toBe("analysis-provider/analysis-model");
	});

	test("routes each operation with its own provider, model, and thinking", async () => {
		const seen: Array<{
			model: unknown;
			context: Context;
			options: SimpleStreamOptions | undefined;
		}> = [];
		const completeFn = ((model: unknown, context: Context, options?: SimpleStreamOptions) => {
			seen.push({ model, context, options });
			const text =
				context.systemPrompt === SEGMENTATION_SYSTEM_PROMPT ? VALID_SEGMENTATION : VALID_ANALYSIS;
			return Promise.resolve(makeResponse({ content: [{ type: "text", text }] }));
		}) as CompleteSimpleFunction;
		const gateway = createGateway(makeRegistry(), { completeFn });

		expect(await gateway.segmentTurns(REQUEST, { signal: signal() })).toMatchObject({ ok: true });
		expect(
			await gateway.analyzeEpisode({ json: '{"targetEpisode":1}' }, { signal: signal() }),
		).toMatchObject({ ok: true });
		expect(seen).toHaveLength(2);
		expect(seen[0]).toMatchObject({
			model: { id: "segmentation-token" },
			context: { systemPrompt: SEGMENTATION_SYSTEM_PROMPT },
			options: { reasoning: "medium" },
		});
		expect(seen[1]).toMatchObject({
			model: { id: "analysis-token" },
			context: { systemPrompt: EPISODE_ANALYSIS_SYSTEM_PROMPT },
			options: { reasoning: "high" },
		});
	});

	test("labels model and auth failures with the attempted selection", async () => {
		const missing = createGateway(makeRegistry({ missingRef: "analysis-provider/analysis-model" }));
		expect(await missing.analyzeEpisode({ json: "{}" }, { signal: signal() })).toEqual({
			ok: false,
			error: {
				code: "model-unavailable",
				message: "analysis-provider/analysis-model is not available",
			},
		});

		const noAuth = createGateway(makeRegistry({ auth: { ok: true } }));
		expect(await noAuth.segmentTurns(REQUEST, { signal: signal() })).toEqual({
			ok: false,
			error: {
				code: "auth",
				message: "no segmentation-provider auth found; run /login or configure Pi auth",
			},
		});
	});

	test("preserves request, abort, and invalid-response errors as values", async () => {
		const failed = createGateway(makeRegistry(), {
			completeFn: completeWith(makeResponse({ stopReason: "error", errorMessage: "rate limited" })),
		});
		expect(await failed.segmentTurns(REQUEST, { signal: signal() })).toEqual({
			ok: false,
			error: { code: "request-failed", message: "rate limited" },
		});

		const aborted = createGateway(makeRegistry(), {
			completeFn: completeWith(makeResponse({ stopReason: "aborted" })),
		});
		expect(await aborted.segmentTurns(REQUEST, { signal: signal() })).toEqual({
			ok: false,
			error: { code: "aborted", message: "segmentation request aborted" },
		});

		const invalid = createGateway(makeRegistry(), {
			completeFn: completeWith(
				makeResponse({ content: [{ type: "text", text: "sorry, no JSON today" }] }),
			),
		});
		const invalidResult = await invalid.segmentTurns(REQUEST, { signal: signal() });
		expect(invalidResult.ok).toBe(false);
		if (!invalidResult.ok) expect(invalidResult.error.code).toBe("invalid-response");
	});

	test("maps thrown completion errors and signal cancellation", async () => {
		const throwing = (() => Promise.reject(new Error("socket hang up"))) as CompleteSimpleFunction;
		const gateway = createGateway(makeRegistry(), { completeFn: throwing });
		expect(await gateway.segmentTurns(REQUEST, { signal: signal() })).toEqual({
			ok: false,
			error: { code: "request-failed", message: "socket hang up" },
		});

		const controller = new AbortController();
		controller.abort();
		expect(await gateway.segmentTurns(REQUEST, { signal: controller.signal })).toEqual({
			ok: false,
			error: { code: "aborted", message: "segmentation request aborted" },
		});
	});
});

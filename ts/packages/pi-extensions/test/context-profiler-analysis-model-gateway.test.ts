import { describe, expect, test } from "vitest";

import type * as PiAi from "@earendil-works/pi-ai";
import { EPISODE_ANALYSIS_SYSTEM_PROMPT } from "../src/context-profiler/analysis.ts";
import {
	createCodexAnalysisModelGateway,
	type AnalysisModelRegistry,
} from "../src/context-profiler/analysis-model-gateway.ts";
import { SEGMENTATION_MODEL, SEGMENTATION_PROVIDER, SEGMENTATION_SYSTEM_PROMPT } from "../src/context-profiler/segmentation.ts";

type CompleteSimpleFunction = typeof PiAi.completeSimple;

const MODEL_TOKEN = { id: "fake-model" };

interface FakeRegistryState {
	hasModel?: boolean;
	auth?: { ok: true; apiKey?: string; headers?: Record<string, string> } | { ok: false; error: string };
}

function makeRegistry(state: FakeRegistryState = {}): AnalysisModelRegistry {
	return {
		find(provider, modelId) {
			if (state.hasModel === false) return undefined;
			expect(provider).toBe(SEGMENTATION_PROVIDER);
			expect(modelId).toBe(SEGMENTATION_MODEL);
			return MODEL_TOKEN;
		},
		getApiKeyAndHeaders(model) {
			expect(model).toBe(MODEL_TOKEN);
			return Promise.resolve(state.auth ?? { ok: true, apiKey: "key" });
		},
	};
}

const ZERO_USAGE: PiAi.Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeResponse(overrides: Partial<Pick<PiAi.AssistantMessage, "stopReason" | "errorMessage" | "content">>): PiAi.AssistantMessage {
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

function completeWith(response: PiAi.AssistantMessage): CompleteSimpleFunction {
	return (() => Promise.resolve(response)) as CompleteSimpleFunction;
}

const VALID_TEXT = JSON.stringify({ episodes: [{ startTurn: 1, label: "a", kind: "chat", outcome: "active" }], summary: "One sentence." });
const REQUEST = { json: '{"turns":[]}' };

function signal(): AbortSignal {
	return new AbortController().signal;
}

describe("createCodexAnalysisModelGateway", () => {
	test("maps a registry miss to model-unavailable", async () => {
		const gateway = createCodexAnalysisModelGateway(makeRegistry({ hasModel: false }));
		const result = await gateway.segmentTurns(REQUEST, { signal: signal() });
		expect(result).toEqual({
			ok: false,
			error: { code: "model-unavailable", message: `${SEGMENTATION_PROVIDER}/${SEGMENTATION_MODEL} is not available` },
		});
	});

	test("maps failed or missing auth to auth errors", async () => {
		const failed = createCodexAnalysisModelGateway(makeRegistry({ auth: { ok: false, error: "login expired" } }));
		const failedResult = await failed.segmentTurns(REQUEST, { signal: signal() });
		expect(failedResult).toEqual({ ok: false, error: { code: "auth", message: "login expired" } });

		const missingKey = createCodexAnalysisModelGateway(makeRegistry({ auth: { ok: true } }));
		const missingResult = await missingKey.segmentTurns(REQUEST, { signal: signal() });
		expect(missingResult.ok).toBe(false);
		if (!missingResult.ok) expect(missingResult.error.code).toBe("auth");
	});

	test("maps an error stop reason to request-failed with the provider message", async () => {
		const gateway = createCodexAnalysisModelGateway(makeRegistry(), {
			completeFn: completeWith(makeResponse({ stopReason: "error", errorMessage: "rate limited" })),
		});
		const result = await gateway.segmentTurns(REQUEST, { signal: signal() });
		expect(result).toEqual({ ok: false, error: { code: "request-failed", message: "rate limited" } });
	});

	test("maps an aborted stop reason to aborted", async () => {
		const gateway = createCodexAnalysisModelGateway(makeRegistry(), {
			completeFn: completeWith(makeResponse({ stopReason: "aborted" })),
		});
		const result = await gateway.segmentTurns(REQUEST, { signal: signal() });
		expect(result).toEqual({ ok: false, error: { code: "aborted", message: "segmentation request aborted" } });
	});

	test("maps a thrown completion error to request-failed, or aborted when the signal fired", async () => {
		const throwing = (() => Promise.reject(new Error("socket hang up"))) as CompleteSimpleFunction;
		const gateway = createCodexAnalysisModelGateway(makeRegistry(), { completeFn: throwing });
		const result = await gateway.segmentTurns(REQUEST, { signal: signal() });
		expect(result).toEqual({ ok: false, error: { code: "request-failed", message: "socket hang up" } });

		const controller = new AbortController();
		controller.abort();
		const abortedResult = await gateway.segmentTurns(REQUEST, { signal: controller.signal });
		expect(abortedResult).toEqual({ ok: false, error: { code: "aborted", message: "segmentation request aborted" } });
	});

	test("maps unparseable response text to invalid-response", async () => {
		const gateway = createCodexAnalysisModelGateway(makeRegistry(), {
			completeFn: completeWith(makeResponse({ content: [{ type: "text", text: "sorry, no JSON today" }] })),
		});
		const result = await gateway.segmentTurns(REQUEST, { signal: signal() });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid-response");
	});

	test("returns validated-but-unrepaired segmentation and sends the payload verbatim", async () => {
		const seen: { context?: PiAi.Context; options?: PiAi.SimpleStreamOptions } = {};
		const completeFn = ((_model: unknown, context: PiAi.Context, options?: PiAi.SimpleStreamOptions) => {
			seen.context = context;
			if (options !== undefined) seen.options = options;
			return Promise.resolve(makeResponse({ content: [{ type: "text", text: VALID_TEXT }] }));
		}) as CompleteSimpleFunction;
		const gateway = createCodexAnalysisModelGateway(makeRegistry({ auth: { ok: true, apiKey: "key", headers: { "x-h": "1" } } }), { completeFn });

		const result = await gateway.segmentTurns(REQUEST, { signal: signal() });
		expect(result).toEqual({
			ok: true,
			value: { episodes: [{ startTurn: 1, label: "a", kind: "chat", outcome: "active" }], summary: "One sentence.", delegations: [] },
		});
		expect(seen.context?.systemPrompt).toBe(SEGMENTATION_SYSTEM_PROMPT);
		const userMessage = seen.context?.messages[0];
		expect(userMessage).toMatchObject({ role: "user", content: [{ type: "text", text: REQUEST.json }] });
		expect(seen.options).toMatchObject({ apiKey: "key", headers: { "x-h": "1" }, reasoning: "minimal" });
	});

	test("returns validated episode analysis and sends the payload verbatim", async () => {
		const seen: { context?: PiAi.Context } = {};
		const completeFn = ((_model: unknown, context: PiAi.Context) => {
			seen.context = context;
			return Promise.resolve(makeResponse({ content: [{ type: "text", text: JSON.stringify({ efficiency: "mixed", relevance: "stale" }) }] }));
		}) as CompleteSimpleFunction;
		const gateway = createCodexAnalysisModelGateway(makeRegistry(), { completeFn });

		const result = await gateway.analyzeEpisode({ json: "{\"targetEpisode\":1}" }, { signal: signal() });
		expect(result).toEqual({ ok: true, value: { efficiency: "mixed", relevance: "stale" } });
		expect(seen.context?.systemPrompt).toBe(EPISODE_ANALYSIS_SYSTEM_PROMPT);
		expect(seen.context?.messages[0]).toMatchObject({ role: "user", content: [{ type: "text", text: "{\"targetEpisode\":1}" }] });
	});
});

import { describe, expect, test } from "vitest";

import type * as PiAi from "@earendil-works/pi-ai";
import { callPiModelText, type CompleteSimpleFunction, type PiModelRegistryLike } from "../src/pi-model-call.ts";

const MODEL_TOKEN = { id: "fake-model" };

const ZERO_USAGE: PiAi.Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

interface FakeRegistryState {
	hasModel?: boolean;
	auth?: { ok: true; apiKey?: string; headers?: Record<string, string> } | { ok: false; error: string };
}

function makeRegistry(state: FakeRegistryState = {}): PiModelRegistryLike {
	return {
		find(provider, modelId) {
			expect(provider).toBe("provider");
			expect(modelId).toBe("model");
			return state.hasModel === false ? undefined : MODEL_TOKEN;
		},
		getApiKeyAndHeaders(model) {
			expect(model).toBe(MODEL_TOKEN);
			return Promise.resolve(state.auth ?? { ok: true, apiKey: "key" });
		},
	};
}

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

function baseOptions(overrides: Partial<Parameters<typeof callPiModelText>[0]> = {}): Parameters<typeof callPiModelText>[0] {
	return {
		registry: makeRegistry(),
		provider: "provider",
		modelId: "model",
		systemPrompt: "system",
		userText: "user",
		maxTokens: 12,
		reasoning: "minimal",
		completeFn: completeWith(makeResponse({ content: [{ type: "text", text: "ok" }] })),
		...overrides,
	};
}

describe("callPiModelText", () => {
	test("maps registry miss, auth failure, and missing key", async () => {
		await expect(callPiModelText(baseOptions({ registry: makeRegistry({ hasModel: false }) })))
			.resolves.toEqual({ ok: false, reason: "model-unavailable", message: null });
		await expect(callPiModelText(baseOptions({ registry: makeRegistry({ auth: { ok: false, error: "login expired" } }) })))
			.resolves.toEqual({ ok: false, reason: "auth", message: "login expired" });
		await expect(callPiModelText(baseOptions({ registry: makeRegistry({ auth: { ok: true, apiKey: "" } }) })))
			.resolves.toEqual({ ok: false, reason: "empty-auth", message: null });
	});

	test("maps error and aborted stop reasons", async () => {
		await expect(callPiModelText(baseOptions({ completeFn: completeWith(makeResponse({ stopReason: "error", errorMessage: "rate limited" })) })))
			.resolves.toEqual({ ok: false, reason: "request-failed", message: "rate limited" });
		await expect(callPiModelText(baseOptions({ completeFn: completeWith(makeResponse({ stopReason: "aborted" })) })))
			.resolves.toEqual({ ok: false, reason: "aborted", message: null });
	});

	test("maps thrown errors, using aborted when the signal is already aborted", async () => {
		const throwing = (() => Promise.reject(new Error("socket hang up"))) as CompleteSimpleFunction;
		await expect(callPiModelText(baseOptions({ completeFn: throwing })))
			.resolves.toEqual({ ok: false, reason: "request-failed", message: "socket hang up" });

		const controller = new AbortController();
		controller.abort();
		await expect(callPiModelText(baseOptions({ completeFn: throwing, signal: controller.signal })))
			.resolves.toEqual({ ok: false, reason: "aborted", message: null });
	});

	test("joins multiple text parts", async () => {
		const result = await callPiModelText(baseOptions({
			completeFn: completeWith(makeResponse({
				content: [
					{ type: "text", text: "first" },
					{ type: "thinking", thinking: "hidden" },
					{ type: "text", text: "second" },
				],
			})),
		}));
		expect(result).toEqual({ ok: true, text: "first\nsecond" });
	});

	test("passes context and options through", async () => {
		const controller = new AbortController();
		const seen: { model?: unknown; context?: PiAi.Context; options?: PiAi.SimpleStreamOptions } = {};
		const completeFn = ((model: unknown, context: PiAi.Context, options?: PiAi.SimpleStreamOptions) => {
			seen.model = model;
			seen.context = context;
			if (options !== undefined) seen.options = options;
			return Promise.resolve(makeResponse({ content: [{ type: "text", text: "ok" }] }));
		}) as CompleteSimpleFunction;

		const result = await callPiModelText(baseOptions({
			registry: makeRegistry({ auth: { ok: true, apiKey: "key", headers: { "x-h": "1" } } }),
			completeFn,
			reasoning: "low",
			signal: controller.signal,
			timeoutMs: 123,
		}));

		expect(result).toEqual({ ok: true, text: "ok" });
		expect(seen.model).toBe(MODEL_TOKEN);
		expect(seen.context).toMatchObject({ systemPrompt: "system", messages: [{ role: "user", content: [{ type: "text", text: "user" }] }] });
		expect(seen.options).toMatchObject({ apiKey: "key", headers: { "x-h": "1" }, maxTokens: 12, reasoning: "low", signal: controller.signal, timeoutMs: 123 });
	});
});

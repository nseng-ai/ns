import type { AssistantMessage, SimpleStreamOptions, Usage } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { cleanupSessionResourcesMock } = vi.hoisted(() => ({
	cleanupSessionResourcesMock: vi.fn(),
}));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
	return { ...actual, cleanupSessionResources: cleanupSessionResourcesMock };
});

import {
	callPiModelText,
	type CompleteSimpleFunction,
	type PiModelRegistryLike,
} from "../../src/kit/models/call.ts";

const MODEL_TOKEN = { id: "fake-model" };

const ZERO_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeResponse(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		role: "assistant",
		api: "fake-api",
		provider: "fake-provider",
		model: "fake-model",
		usage: ZERO_USAGE,
		timestamp: 0,
		stopReason: "stop",
		content: [{ type: "text", text: "ok" }],
		...overrides,
	};
}

const registry: PiModelRegistryLike = {
	find: () => MODEL_TOKEN,
	getApiKeyAndHeaders: () => Promise.resolve({ ok: true, apiKey: "key" }),
};

describe("callPiModelText request-session lifecycle", () => {
	beforeEach(() => cleanupSessionResourcesMock.mockClear());

	test.each([
		["success", makeResponse()],
		["model failure", makeResponse({ stopReason: "error", content: [] })],
		["thrown failure", new Error("boom")],
	] as const)("cleans the generated request session after %s", async (_name, outcome) => {
		let requestSessionId: string | undefined;
		const completeFn = ((_model: unknown, _context: unknown, options?: SimpleStreamOptions) => {
			requestSessionId = options?.sessionId;
			return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
		}) as CompleteSimpleFunction;

		await callPiModelText({
			registry,
			provider: "provider",
			modelId: "model",
			systemPrompt: "system",
			userText: "user",
			maxTokens: 12,
			reasoning: "minimal",
			completeFn,
		});

		expect(requestSessionId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(cleanupSessionResourcesMock).toHaveBeenCalledExactlyOnceWith(requestSessionId);
	});
});

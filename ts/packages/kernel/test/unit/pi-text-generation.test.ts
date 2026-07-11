import { describe, expect, test } from "vitest";
import type {
	Api,
	AssistantMessage,
	Model,
	SimpleStreamOptions,
	Usage,
} from "@earendil-works/pi-ai";
import type { completeSimple } from "@earendil-works/pi-ai/compat";

import { PiTextGenerator, type PiModelRegistry } from "../../src/runtime/pi-text-generation.ts";

const TEST_MODEL: Model<Api> = {
	id: "gpt-5.6-luna",
	name: "GPT-5.6 Luna",
	api: "openai-codex-responses",
	provider: "openai-codex",
	baseUrl: "https://example.invalid",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 372_000,
	maxTokens: 128_000,
};

const ZERO_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeRegistry(): PiModelRegistry {
	return {
		find: () => TEST_MODEL,
		getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "key" }),
	};
}

function makeResponse(): AssistantMessage {
	return {
		role: "assistant",
		api: TEST_MODEL.api,
		provider: TEST_MODEL.provider,
		model: TEST_MODEL.id,
		usage: ZERO_USAGE,
		timestamp: 0,
		stopReason: "stop",
		content: [{ type: "text", text: "OK" }],
	};
}

function request() {
	return {
		modelRef: "openai-codex/gpt-5.6-luna",
		operation: "test",
		system: "system",
		prompt: "prompt",
	};
}

describe("PiTextGenerator", () => {
	test("supplies a UUIDv7 session ID to Pi text generation", async () => {
		let observedOptions: SimpleStreamOptions | undefined;
		const complete: typeof completeSimple = async (_model, _context, options) => {
			observedOptions = options;
			return makeResponse();
		};
		const generator = new PiTextGenerator({
			modelRegistry: makeRegistry(),
			completeSimple: complete,
		});

		await expect(generator.generateText(request())).resolves.toMatchObject({
			ok: true,
			text: "OK",
		});
		expect(observedOptions?.sessionId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	test("uses and cleans up a fresh request session ID for each generation", async () => {
		const observedSessionIds: Array<string | undefined> = [];
		const cleanedSessionIds: string[] = [];
		const sessionIds = ["session-1", "session-2"];
		const complete: typeof completeSimple = async (_model, _context, options) => {
			observedSessionIds.push(options?.sessionId);
			return makeResponse();
		};
		const generator = new PiTextGenerator({
			modelRegistry: makeRegistry(),
			completeSimple: complete,
			createRequestSessionId: () => sessionIds.shift() ?? "unexpected",
			cleanupRequestSession: (sessionId) => cleanedSessionIds.push(sessionId),
		});

		await generator.generateText(request());
		await generator.generateText(request());

		expect(observedSessionIds).toEqual(["session-1", "session-2"]);
		expect(cleanedSessionIds).toEqual(["session-1", "session-2"]);
	});
});

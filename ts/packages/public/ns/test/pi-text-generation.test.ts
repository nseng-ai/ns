import { describe, expect, test } from "vitest";
import type {
	Api,
	AssistantMessage,
	Model,
	SimpleStreamOptions,
	Usage,
} from "@earendil-works/pi-ai";
import type { completeSimple } from "@earendil-works/pi-ai/compat";

import { PiTextGenerator } from "../src/cli/pi-text-generation.ts";

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

function makeRegistry() {
	return {
		find: () => TEST_MODEL,
		getApiKeyAndHeaders: async () => ({ ok: true as const, apiKey: "key" }),
	};
}

function makeResponse(options: { stopReason?: "stop" | "error" } = {}): AssistantMessage {
	return {
		role: "assistant",
		api: TEST_MODEL.api,
		provider: TEST_MODEL.provider,
		model: TEST_MODEL.id,
		usage: ZERO_USAGE,
		timestamp: 0,
		stopReason: options.stopReason ?? "stop",
		...(options.stopReason === "error" ? { errorMessage: "generation failed" } : {}),
		content: [{ type: "text", text: "OK" }],
	};
}

function request() {
	return {
		modelSelection: {
			provider: "openai-codex",
			modelId: "gpt-5.6-luna",
			thinking: "minimal" as const,
		},
		operation: "test",
		system: "system",
		prompt: "prompt",
	};
}

describe("private PiTextGenerator", () => {
	test("passes a generated UUIDv7 request session ID to generation", async () => {
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
		expect(observedOptions?.reasoning).toBe("minimal");
	});

	test("rejects unsupported off thinking before model lookup", async () => {
		const generator = new PiTextGenerator({
			modelRegistry: makeRegistry(),
			completeSimple: async () => makeResponse(),
		});

		await expect(
			generator.generateText({
				...request(),
				modelSelection: { ...request().modelSelection, thinking: "off" },
			}),
		).resolves.toEqual({
			ok: false,
			error:
				'Pi simple text generation does not support thinking level "off" for openai-codex/gpt-5.6-luna.',
		});
	});

	test.each([
		["success", async () => makeResponse()],
		["failure", async () => makeResponse({ stopReason: "error" })],
		["throw", async () => Promise.reject(new Error("boom"))],
	] as const)("cleans the same injected request session ID after %s", async (_name, complete) => {
		const observedSessionIds: Array<string | undefined> = [];
		const cleanedSessionIds: string[] = [];
		const generator = new PiTextGenerator({
			modelRegistry: makeRegistry(),
			completeSimple: async (_model, _context, options) => {
				observedSessionIds.push(options?.sessionId);
				return await complete();
			},
			createRequestSessionId: () => "request-session",
			cleanupRequestSession: (sessionId) => cleanedSessionIds.push(sessionId),
		});

		await generator.generateText(request());

		expect(observedSessionIds).toEqual(["request-session"]);
		expect(cleanedSessionIds).toEqual(["request-session"]);
	});
});

import { describe, expect, test } from "vitest";

import { buildBundleSnapshot, buildEpisodesFileJson, computeBundleContentHash } from "../src/context-profiler/bundle.ts";

describe("context-profiler bundle", () => {
	test("refuses to build before provider context exists", () => {
		const result = buildBundleSnapshot({
			messages: null,
			systemPrompt: "sys",
			promptOptions: null,
			sessionId: "sid",
			cwd: "/repo",
			model: "p/m",
			usage: undefined,
			liveSource: "branch-fallback",
		});

		expect(result).toEqual({ ok: false, error: { code: "no-provider-context", message: "no provider context has been captured yet" } });
	});

	test("serializes one verbatim JSON message per line", () => {
		const messages = [{ role: "user", content: "hello\n世界" }, { role: "assistant", content: [{ type: "text", text: "ok" }] }];
		const result = buildBundleSnapshot({
			messages,
			systemPrompt: "system prompt",
			promptOptions: null,
			sessionId: "sid",
			cwd: "/repo",
			model: "p/m",
			usage: undefined,
			liveSource: "context-event",
			capturedAt: new Date("2026-01-02T03:04:05.000Z"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.messagesJsonl.split("\n").slice(0, -1).map((line) => JSON.parse(line) as unknown)).toEqual(messages);
		expect(result.value.manifest).toMatchObject({ sessionId: "sid", cwd: "/repo", model: "p/m", turnCount: 2, capturedAt: "2026-01-02T03:04:05.000Z" });
		expect(result.value.manifest.contentHash).toBe(computeBundleContentHash(result.value.messagesJsonl));
	});

	test("fails the whole bundle when a message is unserializable", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		const result = buildBundleSnapshot({
			messages: [circular],
			systemPrompt: null,
			promptOptions: null,
			sessionId: "sid",
			cwd: "/repo",
			model: "p/m",
			usage: undefined,
			liveSource: "context-event",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("unserializable-message");
	});

	test("episodes file records terminal skipped outcomes", () => {
		const json = buildEpisodesFileJson({
			outcome: { type: "skipped", reason: "too-few-turns" },
			contentHash: "abc",
			analysisModel: "openai-codex/gpt-5.4-mini",
			generatedAt: new Date("2026-01-02T03:04:05.000Z"),
		});

		expect(JSON.parse(json)).toEqual({
			version: 1,
			contentHash: "abc",
			analysisModel: "openai-codex/gpt-5.4-mini",
			generatedAt: "2026-01-02T03:04:05.000Z",
			segmentation: { type: "skipped", reason: "too-few-turns" },
			episodes: [],
		});
	});
});

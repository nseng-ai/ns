import { describe, expect, test } from "vitest";

import { buildBundleSnapshot, buildEpisodesFileJson, computeBundleContentHash } from "../src/context-profiler/bundle.ts";
import { captureCurrentState, createProfilerState, startBundlePersist } from "../src/context-profiler/runtime.ts";
import { FakeBundleStore, makeProfile, sequentialTurns } from "./context-profiler-fakes.ts";

describe("context-profiler bundle", () => {
	test("refuses to build before any context message list exists", () => {
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

	test("captures session context so reload can persist a bundle before the next provider event", async () => {
		const ctx = {
			getSystemPrompt: () => "system",
			sessionManager: {
				getEntries: () => [
					{
						id: "m1",
						parentId: null,
						timestamp: "2026-01-01T00:00:00Z",
						type: "message",
						message: { role: "user", content: "already here" },
					},
				],
				getLeafId: () => "m1",
			},
		} as never;
		const state = captureCurrentState(ctx, createProfilerState());
		const profile = makeProfile(sequentialTurns(1), { liveSource: "session-context" });
		const store = new FakeBundleStore({
			persistResult: { ok: true, value: { ordinal: 1, dir: "/bundle", contentHash: "abc", byteSize: 1, sessionTotalBytes: 1, reused: false, sessionId: "sid", model: "p/m", turnCount: 1, capturedAt: "now" } },
		});

		const result = startBundlePersist({ store, state, profile, sessionId: "sid", onUpdate: () => {} });

		expect(result.initial).toEqual({ type: "pending" });
		expect(await result.whenPersisted).toMatchObject({ ordinal: 1 });
		expect(state.latestContextSource).toBe("session-context");
		expect(store.persistedSnapshots[0]?.messagesJsonl).toContain("already here");
	});

	test("bundle persist skip explains missing context without requiring a throwaway prompt", async () => {
		const state = createProfilerState();
		const profile = makeProfile(sequentialTurns(2), { liveSource: "branch-fallback" });
		const store = new FakeBundleStore({
			persistResult: { ok: false, error: { code: "io-error", message: "should not persist" } },
		});

		const result = startBundlePersist({ store, state, profile, sessionId: "sid", onUpdate: () => {} });

		expect(result.initial).toMatchObject({ type: "skipped", reason: "no-provider-context" });
		expect(result.initial.type === "skipped" && result.initial.message).toContain("contextEvents=0");
		expect(result.initial.type === "skipped" && result.initial.message).not.toContain("Send one normal prompt");
		expect(await result.whenPersisted).toBeNull();
		expect(store.persistedSnapshots).toEqual([]);
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

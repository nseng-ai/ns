import { describe, expect, test } from "vitest";

import { buildBundleSnapshot, buildEpisodesFileJson, computeBundleContentHash } from "../src/context-profiler/bundle.ts";
import { captureCurrentState, createProfilerState, createSegmentationCacheCell, startBundlePersist, startProfilerWork, type ProfilerState } from "../src/context-profiler/runtime.ts";
import { FakeBundleStore, FakeSegmentationGateway, makeProfile, sequentialTurns } from "./context-profiler-fakes.ts";

const PERSISTED_BUNDLE = {
	ordinal: 1,
	dir: "/bundle",
	byteSize: 1,
	sessionTotalBytes: 1,
	isReused: false,
	manifest: { version: 1, contentHash: "abc", sessionId: "sid", model: "p/m", turnCount: 5, capturedAt: "now" },
} as const;

function stateWithConversation(): ProfilerState {
	return {
		...createProfilerState(),
		lastSystemPrompt: "system",
		latestContext: { source: "context-event", messages: [{ role: "user", content: "hello" }] },
	};
}

async function settled(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("context-profiler bundle", () => {
	test("refuses to build before any conversation context exists", () => {
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

		expect(result).toEqual({ ok: false, error: { code: "empty-context", message: "no conversation context to bundle yet" } });
	});

	test("refuses to persist an empty conversation context", () => {
		const result = buildBundleSnapshot({
			messages: [],
			systemPrompt: "sys",
			promptOptions: null,
			sessionId: "sid",
			cwd: "/repo",
			model: "p/m",
			usage: undefined,
			liveSource: "session-context",
		});

		expect(result).toEqual({ ok: false, error: { code: "empty-context", message: "no conversation context to bundle yet" } });
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
			persistResult: {
				ok: true,
				value: {
					ordinal: 1,
					dir: "/bundle",
					byteSize: 1,
					sessionTotalBytes: 1,
					isReused: false,
					manifest: { version: 1, contentHash: "abc", sessionId: "sid", model: "p/m", turnCount: 1, capturedAt: "now" },
				},
			},
		});

		const result = startBundlePersist({ store, state, profile, sessionId: "sid", onUpdate: () => {} });

		expect(result.initial).toEqual({ type: "pending" });
		expect(await result.whenPersisted).toMatchObject({ ordinal: 1 });
		expect(state.latestContext?.source).toBe("session-context");
		expect(store.persistedSnapshots[0]?.messagesJsonl).toContain("already here");
	});

	test("bundle persist skips a fresh session with no conversation", async () => {
		const ctx = {
			getSystemPrompt: () => "system",
			sessionManager: {
				getEntries: () => [],
				getLeafId: () => null,
			},
		} as never;
		const state = captureCurrentState(ctx, createProfilerState());
		const profile = makeProfile([], { liveSource: "session-context" });
		const store = new FakeBundleStore({
			persistResult: { ok: false, error: { code: "io-error", message: "should not persist" } },
		});

		const result = startBundlePersist({ store, state, profile, sessionId: "sid", onUpdate: () => {} });

		expect(result.initial).toEqual({ type: "skipped", reason: "empty-context" });
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

	test("startProfilerWork writes episodes with the gateway analysis model", async () => {
		const store = new FakeBundleStore({ persistResult: { ok: true, value: PERSISTED_BUNDLE } });
		const gateway = new FakeSegmentationGateway({
			result: {
				ok: true,
				value: { episodes: [{ startTurn: 1, label: "work", kind: "edit", outcome: "active" }], summary: null, delegations: [] },
			},
		});

		const work = startProfilerWork({
			store,
			gateway,
			state: stateWithConversation(),
			profile: makeProfile(sequentialTurns(5)),
			sessionId: "sid",
			cache: createSegmentationCacheCell(),
			force: false,
			onSegmentationUpdate: () => {},
			onPersistenceUpdate: () => {},
		});
		await settled();

		expect(work.initialPersistence).toEqual({ type: "pending" });
		expect(store.episodesWrites).toHaveLength(1);
		expect(JSON.parse(store.episodesWrites[0]?.json ?? "{}").analysisModel).toBe(gateway.analysisModel);
	});

	test("startProfilerWork skips episodes write when persistence is skipped", async () => {
		const store = new FakeBundleStore({ persistResult: { ok: false, error: { code: "io-error", message: "should not persist" } } });
		const gateway = new FakeSegmentationGateway({ result: { ok: true, value: { episodes: [], summary: null, delegations: [] } } });

		const work = startProfilerWork({
			store,
			gateway,
			state: createProfilerState(),
			profile: makeProfile(sequentialTurns(5)),
			sessionId: "sid",
			cache: createSegmentationCacheCell(),
			force: false,
			onSegmentationUpdate: () => {},
			onPersistenceUpdate: () => {},
		});
		await settled();

		expect(work.initialPersistence).toEqual({ type: "skipped", reason: "empty-context" });
		expect(store.persistedSnapshots).toEqual([]);
		expect(store.episodesWrites).toEqual([]);
	});

	test("startProfilerWork reports episodes write errors", async () => {
		const resultLog: unknown[] = [];
		const store = new FakeBundleStore({
			persistResult: { ok: true, value: PERSISTED_BUNDLE },
			writeResult: { ok: false, error: { code: "io-error", message: "disk full" } },
		});
		const gateway = new FakeSegmentationGateway({ result: { ok: true, value: { episodes: [], summary: null, delegations: [] } } });

		startProfilerWork({
			store,
			gateway,
			state: stateWithConversation(),
			profile: makeProfile(sequentialTurns(5)),
			sessionId: "sid",
			cache: createSegmentationCacheCell(),
			force: false,
			onSegmentationUpdate: () => {},
			onPersistenceUpdate: () => {},
			onEpisodesWriteResult: (result) => resultLog.push(result),
		});
		await settled();

		expect(resultLog).toEqual([{ ok: false, error: { code: "io-error", message: "disk full" } }]);
	});

	test("startProfilerWork detach gates segmentation updates", async () => {
		let releaseGate!: () => void;
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		const updates: unknown[] = [];
		const store = new FakeBundleStore({ persistResult: { ok: true, value: PERSISTED_BUNDLE } });
		const gateway = new FakeSegmentationGateway({
			result: {
				ok: true,
				value: { episodes: [{ startTurn: 1, label: "work", kind: "edit", outcome: "active" }], summary: null, delegations: [] },
			},
			gate,
		});

		const work = startProfilerWork({
			store,
			gateway,
			state: stateWithConversation(),
			profile: makeProfile(sequentialTurns(5)),
			sessionId: "sid",
			cache: createSegmentationCacheCell(),
			force: false,
			onSegmentationUpdate: (state) => updates.push(state),
			onPersistenceUpdate: () => {},
		});
		work.detach();
		releaseGate();
		await settled();

		expect(updates).toEqual([]);
	});
});

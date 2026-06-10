import { describe, expect, test } from "vitest";

import type { LiveTurn, ProfileSnapshot } from "../src/context-profiler/model.ts";
import { normalizeMessage } from "../src/context-profiler/model.ts";
import { createProfilerState, startSegmentation, type ProfilerState } from "../src/context-profiler/runtime.ts";
import { computeSegmentationFingerprint, type SegmentationState } from "../src/context-profiler/segmentation.ts";
import type { SegmentationCallResult } from "../src/context-profiler/segmentation-gateway.ts";
import { FakeSegmentationGateway } from "./context-profiler-fakes.ts";

function makeTurn(index: number, overrides: Partial<LiveTurn> = {}): LiveTurn {
	return {
		index,
		role: "user",
		tokens: { value: 4, provenance: "estimated" },
		toolNames: [],
		excerpt: `turn ${index}`,
		message: normalizeMessage({ role: "user", content: `turn ${index}` }),
		...overrides,
	};
}

function makeProfile(turnCount: number): ProfileSnapshot {
	const turns = Array.from({ length: turnCount }, (_unused, position) => makeTurn(position + 1));
	return {
		cwd: "/repo",
		model: "anthropic/claude-fable-5",
		usage: undefined,
		baseRegions: [],
		liveTurns: turns,
		liveRegions: [],
		liveSource: "context-event",
		cap: { originalCount: turnCount, includedCount: turnCount, elidedMiddleTurns: 0 },
		openedAt: "12:00:00",
	};
}

const SUCCESS: SegmentationCallResult = {
	ok: true,
	value: {
		episodes: [{ startTurn: 1, label: "the work", kind: "edit", outcome: "active" }],
		summary: "A short session.",
	},
};

function collectUpdates(): { updates: SegmentationState[]; onUpdate: (state: SegmentationState) => void } {
	const updates: SegmentationState[] = [];
	return { updates, onUpdate: (state) => updates.push(state) };
}

async function settled(): Promise<void> {
	// Two microtask hops cover the gateway promise plus the .then handler.
	await Promise.resolve();
	await Promise.resolve();
}

describe("startSegmentation", () => {
	test("success: loading initial, onUpdate(ready) with repaired episodes, result cached", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		const profile = makeProfile(5);
		const { updates, onUpdate } = collectUpdates();

		const { initial } = startSegmentation({ gateway, profile, state, force: false, onUpdate });
		expect(initial).toEqual({ type: "loading" });
		await settled();

		expect(updates).toHaveLength(1);
		expect(updates[0]).toEqual({
			type: "ready",
			episodes: [{ label: "the work", kind: "edit", outcome: "active", turnRange: { start: 1, end: 5 } }],
			summary: "A short session.",
		});
		expect(state.segmentationCache).toMatchObject({ fingerprint: computeSegmentationFingerprint(profile), summary: "A short session." });
		expect(gateway.calls).toHaveLength(1);
	});

	test("cache hit: initial is ready and the gateway is never called", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		const profile = makeProfile(5);
		const seeded = startSegmentation({ gateway, profile, state, force: false, onUpdate: () => {} });
		expect(seeded.initial.type).toBe("loading");
		await settled();

		const { updates, onUpdate } = collectUpdates();
		const { initial } = startSegmentation({ gateway, profile: makeProfile(5), state, force: false, onUpdate });
		expect(initial).toEqual({
			type: "ready",
			episodes: [{ label: "the work", kind: "edit", outcome: "active", turnRange: { start: 1, end: 5 } }],
			summary: "A short session.",
		});
		await settled();
		expect(updates).toEqual([]);
		expect(gateway.calls).toHaveLength(1);
	});

	test("a changed snapshot misses the cache", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		startSegmentation({ gateway, profile: makeProfile(5), state, force: false, onUpdate: () => {} });
		await settled();

		const { initial } = startSegmentation({ gateway, profile: makeProfile(6), state, force: false, onUpdate: () => {} });
		expect(initial).toEqual({ type: "loading" });
		await settled();
		expect(gateway.calls).toHaveLength(2);
	});

	test("force bypasses a valid cache and replaces it", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		const profile = makeProfile(5);
		startSegmentation({ gateway, profile, state, force: false, onUpdate: () => {} });
		await settled();
		const firstCache = state.segmentationCache;

		const { initial } = startSegmentation({ gateway, profile: makeProfile(5), state, force: true, onUpdate: () => {} });
		expect(initial).toEqual({ type: "loading" });
		await settled();
		expect(gateway.calls).toHaveLength(2);
		expect(state.segmentationCache).not.toBe(firstCache);
	});

	test("error: onUpdate(error) with the verbatim message, nothing cached", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({
			result: { ok: false, error: { code: "auth", message: "no openai-codex auth found; run /login or configure Pi auth" } },
		});
		const { updates, onUpdate } = collectUpdates();

		const { initial } = startSegmentation({ gateway, profile: makeProfile(5), state, force: false, onUpdate });
		expect(initial).toEqual({ type: "loading" });
		await settled();

		expect(updates).toEqual([{ type: "error", message: "no openai-codex auth found; run /login or configure Pi auth" }]);
		expect(state.segmentationCache).toBeNull();
	});

	test("fewer than three turns: idle, no gateway call", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		const { updates, onUpdate } = collectUpdates();

		const { initial } = startSegmentation({ gateway, profile: makeProfile(2), state, force: false, onUpdate });
		expect(initial).toEqual({ type: "idle" });
		await settled();
		expect(updates).toEqual([]);
		expect(gateway.calls).toHaveLength(0);
	});

	test("abort before resolve: no onUpdate, nothing cached", async () => {
		const state = createProfilerState();
		let release = (): void => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const gateway = new FakeSegmentationGateway({ result: SUCCESS, gate });
		const { updates, onUpdate } = collectUpdates();

		const { initial, abort } = startSegmentation({ gateway, profile: makeProfile(5), state, force: false, onUpdate });
		expect(initial).toEqual({ type: "loading" });
		abort();
		release();
		await settled();

		expect(updates).toEqual([]);
		expect(state.segmentationCache).toBeNull();
	});

	test("a gateway aborted result is swallowed even without a local abort", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: { ok: false, error: { code: "aborted", message: "segmentation request aborted" } } });
		const { updates, onUpdate } = collectUpdates();

		startSegmentation({ gateway, profile: makeProfile(5), state, force: false, onUpdate });
		await settled();
		expect(updates).toEqual([]);
	});
});

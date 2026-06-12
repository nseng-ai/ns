import { describe, expect, test } from "vitest";

import { createProfilerState, startSegmentationBatch } from "../src/context-profiler/runtime.ts";
import { computeSegmentationFingerprint, type SegmentationState } from "../src/context-profiler/segmentation.ts";
import type { AnalysisModelGateway, SegmentationCallResult } from "../src/context-profiler/analysis-model-gateway.ts";
import { FakeSegmentationGateway, makeProfile, sequentialTurns } from "./context-profiler-fakes.ts";

/** Models a buggy gateway that violates the errors-as-values contract by rejecting. */
class RejectingSegmentationGateway implements AnalysisModelGateway {
	async segmentTurns(): Promise<SegmentationCallResult> {
		throw new Error("gateway contract violation");
	}

	async analyzeEpisode(): Promise<never> {
		throw new Error("should not analyze after segmentation rejection");
	}
}

const SUCCESS: SegmentationCallResult = {
	ok: true,
	value: {
		episodes: [{ startTurn: 1, label: "the work", kind: "edit", outcome: "active" }],
		summary: "A short session.",
		delegations: [{ turn: 3, label: "delegate investigation", confidence: "high" }],
	},
};

function collectUpdates(): { updates: SegmentationState[]; onUpdate: (state: SegmentationState) => void } {
	const updates: SegmentationState[] = [];
	return { updates, onUpdate: (state) => updates.push(state) };
}

async function settled(): Promise<void> {
	// Three microtask hops cover segmentation plus one wave of episode-analysis handlers.
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("startSegmentationBatch", () => {
	test("success: loading initial, onUpdate(ready) with repaired episodes, result cached", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		const profile = makeProfile(sequentialTurns(5));
		const { updates, onUpdate } = collectUpdates();

		const { initial } = startSegmentationBatch({ gateway, profile, state, force: false, onUpdate });
		expect(initial).toEqual({ type: "loading" });
		await settled();

		expect(updates).toHaveLength(2);
		expect(updates[0]).toEqual({
			type: "ready",
			episodes: [{ label: "the work", kind: "edit", outcome: "active", turnRange: { start: 1, end: 5 } }],
			summary: "A short session.",
			delegations: [{ turn: 3, label: "delegate investigation", confidence: "high" }],
			analysis: ["loading"],
		});
		expect(updates[1]).toEqual({
			type: "ready",
			episodes: [{ label: "the work", kind: "edit", outcome: "active", turnRange: { start: 1, end: 5 }, efficiency: "efficient", relevance: "load-bearing" }],
			summary: "A short session.",
			delegations: [{ turn: 3, label: "delegate investigation", confidence: "high" }],
			analysis: ["ready"],
		});
		expect(state.segmentationCache).toMatchObject({
			fingerprint: computeSegmentationFingerprint(profile),
			summary: "A short session.",
			delegations: [{ turn: 3, label: "delegate investigation", confidence: "high" }],
		});
		expect(gateway.calls).toHaveLength(1);
		expect(gateway.analysisCalls).toHaveLength(1);
	});

	test("cache hit: initial is ready and the gateway is never called", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		const profile = makeProfile(sequentialTurns(5));
		const seeded = startSegmentationBatch({ gateway, profile, state, force: false, onUpdate: () => {} });
		expect(seeded.initial.type).toBe("loading");
		await settled();

		const { updates, onUpdate } = collectUpdates();
		const { initial } = startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(5)), state, force: false, onUpdate });
		expect(initial).toEqual({
			type: "ready",
			episodes: [{ label: "the work", kind: "edit", outcome: "active", turnRange: { start: 1, end: 5 }, efficiency: "efficient", relevance: "load-bearing" }],
			summary: "A short session.",
			delegations: [{ turn: 3, label: "delegate investigation", confidence: "high" }],
			analysis: ["ready"],
		});
		await settled();
		expect(updates).toEqual([]);
		expect(gateway.calls).toHaveLength(1);
		expect(gateway.analysisCalls).toHaveLength(1);
	});

	test("cache hit with missing verdicts analyzes only the gaps", async () => {
		const state = createProfilerState();
		const profile = makeProfile(sequentialTurns(8));
		state.segmentationCache = {
			fingerprint: computeSegmentationFingerprint(profile),
			summary: "A short session.",
			delegations: [{ turn: 6, label: "delegate fix", confidence: "low" }],
			episodes: [
				{ label: "setup", kind: "explore", outcome: "completed", turnRange: { start: 1, end: 4 }, efficiency: "efficient", relevance: "load-bearing" },
				{ label: "fix", kind: "edit", outcome: "active", turnRange: { start: 5, end: 8 } },
			],
		};
		const gateway = new FakeSegmentationGateway({ result: SUCCESS, analysisResult: { ok: true, value: { efficiency: "mixed", relevance: "still-useful", summary: null } } });
		const { updates, onUpdate } = collectUpdates();

		const { initial } = startSegmentationBatch({ gateway, profile, state, force: false, onUpdate });
		expect(initial).toEqual({
			type: "ready",
			summary: "A short session.",
			delegations: [{ turn: 6, label: "delegate fix", confidence: "low" }],
			analysis: ["ready", "loading"],
			episodes: [
				{ label: "setup", kind: "explore", outcome: "completed", turnRange: { start: 1, end: 4 }, efficiency: "efficient", relevance: "load-bearing" },
				{ label: "fix", kind: "edit", outcome: "active", turnRange: { start: 5, end: 8 } },
			],
		});
		await settled();

		expect(gateway.calls).toHaveLength(0);
		expect(gateway.analysisCalls).toHaveLength(1);
		expect(JSON.parse(gateway.analysisCalls[0]?.json ?? "{}").targetEpisode.delegations).toEqual([{ turn: 6, label: "delegate fix", confidence: "low" }]);
		expect(updates).toEqual([
			{
				type: "ready",
				summary: "A short session.",
				delegations: [{ turn: 6, label: "delegate fix", confidence: "low" }],
				analysis: ["ready", "ready"],
				episodes: [
					{ label: "setup", kind: "explore", outcome: "completed", turnRange: { start: 1, end: 4 }, efficiency: "efficient", relevance: "load-bearing" },
					{ label: "fix", kind: "edit", outcome: "active", turnRange: { start: 5, end: 8 }, efficiency: "mixed", relevance: "still-useful" },
				],
			},
		]);
	});

	test("analysis summary is cached on the episode and surfaced as analysisSummary", async () => {
		const state = createProfilerState();
		const summary = "t1-t5 land the edit directly; ≈minimal churn, one decisive bash run at t3.";
		const gateway = new FakeSegmentationGateway({
			result: SUCCESS,
			analysisResult: { ok: true, value: { efficiency: "efficient", relevance: "load-bearing", summary } },
		});
		const { updates, onUpdate } = collectUpdates();

		startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(5)), state, force: false, onUpdate });
		await settled();

		expect(updates[1]).toMatchObject({
			type: "ready",
			analysis: ["ready"],
			episodes: [{ efficiency: "efficient", relevance: "load-bearing", analysisSummary: summary }],
		});
		expect(state.segmentationCache?.episodes[0]?.analysisSummary).toBe(summary);
	});

	test("episode analysis failure is visible but not cached", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({
			result: SUCCESS,
			analysisResult: { ok: false, error: { code: "invalid-response", message: "response JSON has no valid verdict pair" } },
		});
		const { updates, onUpdate } = collectUpdates();

		startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(5)), state, force: false, onUpdate });
		await settled();

		expect(updates[0]).toMatchObject({ type: "ready", analysis: ["loading"] });
		expect(updates[1]).toMatchObject({ type: "ready", analysis: [{ type: "error", message: "response JSON has no valid verdict pair" }] });
		expect(state.segmentationCache?.episodes[0]).not.toHaveProperty("efficiency");
	});

	test("a changed snapshot misses the cache", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(5)), state, force: false, onUpdate: () => {} });
		await settled();

		const { initial } = startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(6)), state, force: false, onUpdate: () => {} });
		expect(initial).toEqual({ type: "loading" });
		await settled();
		expect(gateway.calls).toHaveLength(2);
		expect(gateway.analysisCalls).toHaveLength(2);
	});

	test("force bypasses a valid cache and replaces it", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		const profile = makeProfile(sequentialTurns(5));
		startSegmentationBatch({ gateway, profile, state, force: false, onUpdate: () => {} });
		await settled();
		const firstCache = state.segmentationCache;

		const { initial } = startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(5)), state, force: true, onUpdate: () => {} });
		expect(initial).toEqual({ type: "loading" });
		await settled();
		expect(gateway.calls).toHaveLength(2);
		expect(gateway.analysisCalls).toHaveLength(2);
		expect(state.segmentationCache).not.toBe(firstCache);
	});

	test("error: onUpdate(error) with the verbatim message, nothing cached", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({
			result: { ok: false, error: { code: "auth", message: "no openai-codex auth found; run /login or configure Pi auth" } },
		});
		const { updates, onUpdate } = collectUpdates();

		const { initial } = startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(5)), state, force: false, onUpdate });
		expect(initial).toEqual({ type: "loading" });
		await settled();

		expect(updates).toEqual([{ type: "error", message: "no openai-codex auth found; run /login or configure Pi auth" }]);
		expect(state.segmentationCache).toBeNull();
	});

	test("fewer than three turns: idle, no gateway call", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		const { updates, onUpdate } = collectUpdates();

		const { initial } = startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(2)), state, force: false, onUpdate });
		expect(initial).toEqual({ type: "idle" });
		await settled();
		expect(updates).toEqual([]);
		expect(gateway.calls).toHaveLength(0);
	});

	test("detach before resolve: no onUpdate, nothing cached", async () => {
		const state = createProfilerState();
		let release = (): void => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const gateway = new FakeSegmentationGateway({ result: SUCCESS, gate });
		const { updates, onUpdate } = collectUpdates();

		const { initial, detach } = startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(5)), state, force: false, onUpdate });
		expect(initial).toEqual({ type: "loading" });
		detach();
		release();
		await settled();

		expect(updates).toEqual([]);
		expect(state.segmentationCache).toBeNull();
	});

	test("a gateway aborted result is swallowed even without a local abort", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: { ok: false, error: { code: "aborted", message: "segmentation request aborted" } } });
		const { updates, onUpdate } = collectUpdates();

		startSegmentationBatch({ gateway, profile: makeProfile(sequentialTurns(5)), state, force: false, onUpdate });
		await settled();
		expect(updates).toEqual([]);
	});

	test("a gateway rejection yields exactly one onUpdate(error), nothing cached", async () => {
		const state = createProfilerState();
		const { updates, onUpdate } = collectUpdates();

		const { initial } = startSegmentationBatch({ gateway: new RejectingSegmentationGateway(), profile: makeProfile(sequentialTurns(5)), state, force: false, onUpdate });
		expect(initial).toEqual({ type: "loading" });
		await settled();

		expect(updates).toEqual([{ type: "error", message: "gateway contract violation" }]);
		expect(state.segmentationCache).toBeNull();
	});

	test("an onUpdate that throws after ready does not produce a follow-up error update", async () => {
		const state = createProfilerState();
		const gateway = new FakeSegmentationGateway({ result: SUCCESS });
		const updates: SegmentationState[] = [];

		// The throw escapes the fulfillment handler as an unhandled rejection by
		// design (see startSegmentationBatch). Swap out vitest's process listeners for
		// the duration so the deliberate rejection does not fail the run.
		const rejections: unknown[] = [];
		const suspendedListeners = process.listeners("unhandledRejection");
		process.removeAllListeners("unhandledRejection");
		process.on("unhandledRejection", (reason) => rejections.push(reason));
		try {
			startSegmentationBatch({
				gateway,
				profile: makeProfile(sequentialTurns(5)),
				state,
				force: false,
				onUpdate: (segmentation) => {
					updates.push(segmentation);
					throw new Error("render exploded");
				},
			});
			await settled();
			// Let the unhandledRejection event (a macrotask) fire before asserting.
			await new Promise((resolve) => setTimeout(resolve, 0));
		} finally {
			process.removeAllListeners("unhandledRejection");
			for (const listener of suspendedListeners) process.on("unhandledRejection", listener);
		}

		expect(updates).toHaveLength(1);
		expect(updates[0]?.type).toBe("ready");
		expect(rejections).toHaveLength(1);
		expect(rejections[0]).toBeInstanceOf(Error);
		expect((rejections[0] as Error).message).toBe("render exploded");
		// The ready result was still cached before the handler threw.
		expect(state.segmentationCache).not.toBeNull();
	});
});

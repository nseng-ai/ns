import { describe, expect, test } from "vitest";

import {
	createSegmentationCacheCell,
	startSegmentationBatch,
} from "../../../src/context-profiler/runtime.ts";
import type { SegmentationCallResult } from "../../../src/context-profiler/analysis-model-gateway.ts";
import type { SegmentationState } from "../../../src/context-profiler/segmentation.ts";
import {
	FakeSegmentationGateway,
	makeProfile,
	sequentialTurns,
} from "../../context-profiler/context-profiler-fakes.ts";

const SUCCESS: SegmentationCallResult = {
	ok: true,
	value: {
		episodes: [{ startTurn: 1, label: "the work", kind: "edit", outcome: "active" }],
		summary: "A short session.",
		delegations: [{ turn: 3, label: "delegate investigation", confidence: "high" }],
	},
};

async function settled(): Promise<void> {
	// Three microtask hops cover segmentation plus one wave of episode-analysis handlers.
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("startSegmentationBatch process listener behavior", () => {
	test("an onUpdate that throws after ready does not produce a follow-up error update", async () => {
		const cell = createSegmentationCacheCell();
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
				cache: cell,
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
		expect(cell.read()).not.toBeNull();
	});
});

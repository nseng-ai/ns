import { describe, expect, test } from "vitest";

import {
	CONTEXT_THRESHOLDS_TOKENS,
	evaluateContextThreshold,
} from "../../src/context-threshold-warning/model.ts";

describe("context threshold transition", () => {
	test("defines the five absolute thresholds in ascending order", () => {
		expect(CONTEXT_THRESHOLDS_TOKENS).toEqual([200_000, 400_000, 600_000, 800_000, 1_000_000]);
	});
	test("treats the first usable observation as rising from zero", () => {
		expect(evaluateContextThreshold(undefined, 650_000)).toEqual({
			nextPreviousTokens: 650_000,
			crossedThreshold: 600_000,
		});
	});

	test("does nothing below the first threshold", () => {
		expect(evaluateContextThreshold(undefined, 199_999)).toEqual({
			nextPreviousTokens: 199_999,
			crossedThreshold: undefined,
		});
	});

	test("crosses inclusively at an exact boundary", () => {
		expect(evaluateContextThreshold(199_999, 200_000).crossedThreshold).toBe(200_000);
	});

	test("selects the highest threshold crossed by a jump", () => {
		expect(evaluateContextThreshold(150_000, 650_000).crossedThreshold).toBe(600_000);
	});

	test("warns on incremental threshold crossings", () => {
		expect(evaluateContextThreshold(250_000, 450_000).crossedThreshold).toBe(400_000);
		expect(evaluateContextThreshold(450_000, 650_000).crossedThreshold).toBe(600_000);
	});

	test("does not repeat while steady or increasing within a handled band", () => {
		expect(evaluateContextThreshold(650_000, 650_000).crossedThreshold).toBeUndefined();
		expect(evaluateContextThreshold(650_000, 799_999).crossedThreshold).toBeUndefined();
	});

	test("a drop rearms one threshold for a later recrossing", () => {
		const drop = evaluateContextThreshold(650_000, 350_000);
		expect(drop.crossedThreshold).toBeUndefined();
		expect(evaluateContextThreshold(drop.nextPreviousTokens, 450_000).crossedThreshold).toBe(
			400_000,
		);
	});

	test("a large drop rearms several thresholds and later selects the highest recrossed", () => {
		const drop = evaluateContextThreshold(850_000, 150_000);
		expect(drop.crossedThreshold).toBeUndefined();
		expect(evaluateContextThreshold(drop.nextPreviousTokens, 850_000).crossedThreshold).toBe(
			800_000,
		);
	});
});

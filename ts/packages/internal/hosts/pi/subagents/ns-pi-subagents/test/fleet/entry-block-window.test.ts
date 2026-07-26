import { describe, expect, test } from "vitest";

import {
	entryBlockWindowLineCount,
	windowEntryBlocks,
} from "../../src/fleet/entry-block-window.ts";

function block(name: string, lines: number): string[] {
	return Array.from({ length: lines }, (_, index) => `${name}:${index}`);
}

describe("entryBlockWindowLineCount", () => {
	test("counts block rows plus prefix and suffix marker rows", () => {
		const blocks = [block("a", 1), block("b", 2), block("c", 1), block("d", 1)];
		// Interior range needs both markers.
		expect(entryBlockWindowLineCount(blocks, 1, 3)).toBe(2 + 1 + 1 + 1);
		// Range touching the top needs only the suffix marker.
		expect(entryBlockWindowLineCount(blocks, 0, 2)).toBe(1 + 2 + 1);
		// Range touching the bottom needs only the prefix marker.
		expect(entryBlockWindowLineCount(blocks, 2, 4)).toBe(1 + 1 + 1);
		// The full range needs no markers.
		expect(entryBlockWindowLineCount(blocks, 0, 4)).toBe(5);
	});
});

describe("windowEntryBlocks", () => {
	test("prefers upward expansion when both neighbors individually fit", () => {
		const blocks = [block("a", 1), block("b", 1), block("c", 1), block("d", 1), block("e", 1)];
		// Budget of 4 around index 2: upward growth wins the spare rows (all the
		// way to the top, which also releases the prefix marker) and downward
		// growth never happens.
		expect(windowEntryBlocks(blocks, 2, 4)).toEqual(["a:0", "b:0", "c:0", "… 2 more"]);
	});

	test("grows downward when the top boundary is reached", () => {
		const blocks = [block("a", 1), block("b", 1), block("c", 1), block("d", 1)];
		expect(windowEntryBlocks(blocks, 0, 3)).toEqual(["a:0", "b:0", "… 2 more"]);
	});

	test("grows upward when the bottom boundary is reached", () => {
		const blocks = [block("a", 1), block("b", 1), block("c", 1), block("d", 1)];
		expect(windowEntryBlocks(blocks, 3, 3)).toEqual(["… 2 earlier", "c:0", "d:0"]);
	});

	test("shows every block without markers when everything fits", () => {
		const blocks = [block("a", 1), block("b", 2), block("c", 1)];
		expect(windowEntryBlocks(blocks, 1, 10)).toEqual(["a:0", "b:0", "b:1", "c:0"]);
	});

	test("counts both earlier and more marker rows against the budget", () => {
		const blocks = [block("a", 1), block("b", 1), block("c", 1), block("d", 1), block("e", 1)];
		// Budget 3 at an interior index: both markers leave room for only the
		// selected block itself.
		expect(windowEntryBlocks(blocks, 2, 3)).toEqual(["… 2 earlier", "c:0", "… 2 more"]);
	});

	test("rejects a candidate that only stops fitting because of marker accounting", () => {
		const blocks = [block("a", 1), block("b", 1), block("c", 1), block("d", 1), block("e", 1)];
		// Growing upward from index 2 to include b keeps only 2 block rows, but
		// both markers are still required, so the candidate needs 4 rows and is
		// rejected at a budget of 3 purely because markers consume budget.
		expect(windowEntryBlocks(blocks, 2, 3)).toEqual(["… 2 earlier", "c:0", "… 2 more"]);
		// One extra budget row admits that same upward candidate (and upward
		// growth then continues to the top, releasing the prefix marker).
		expect(windowEntryBlocks(blocks, 2, 4)).toEqual(["a:0", "b:0", "c:0", "… 2 more"]);
	});

	test("treats expanded multi-line entries as whole blocks", () => {
		const blocks = [block("a", 1), block("b", 4), block("c", 1), block("d", 1)];
		// Growing upward to include the 4-row block b cannot fit in 5 rows with
		// the suffix marker, so the window grows downward instead.
		expect(windowEntryBlocks(blocks, 2, 5)).toEqual(["… 2 earlier", "c:0", "d:0"]);
	});

	test("truncates a selected block larger than the entire viewport", () => {
		const blocks = [block("a", 1), block("big", 8), block("c", 1)];
		// Both markers fit alongside two of the selected block's rows.
		expect(windowEntryBlocks(blocks, 1, 4)).toEqual(["… 1 earlier", "big:0", "big:1", "… 1 more"]);
	});

	test("omits markers when marker accounting leaves no block row", () => {
		const blocks = [block("a", 1), block("big", 8), block("c", 1)];
		expect(windowEntryBlocks(blocks, 1, 2)).toEqual(["big:0", "big:1"]);
		expect(windowEntryBlocks(blocks, 1, 1)).toEqual(["big:0"]);
	});

	test("clamps a non-positive row budget to one row", () => {
		const blocks = [block("a", 1), block("b", 1)];
		expect(windowEntryBlocks(blocks, 0, 0)).toEqual(["a:0"]);
	});

	test("returns no rows for empty input", () => {
		expect(windowEntryBlocks([], 0, 5)).toEqual([]);
	});
});

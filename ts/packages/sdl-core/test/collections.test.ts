import { describe, expect, test } from "vitest";

import { deduplicateOrderedStrings } from "../src/collections.ts";

describe("deduplicateOrderedStrings", () => {
	test("deduplicates strings while preserving first-seen order", () => {
		expect(deduplicateOrderedStrings(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
	});
});

import { describe, expect, it } from "vitest";

import { deduplicateOrderedStrings } from "../../src/collections.ts";
import { collectStackBranches, collectStackEdges } from "../../src/operations/gt/stack-walk.ts";
import { fakeStackInfo } from "../../src/gateways/fakes/gt.ts";

describe("Graphite stack walking", () => {
	it("deduplicates values while preserving first-seen order", () => {
		expect(deduplicateOrderedStrings(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
	});

	it("collects full-stack branches without trunk or current by default", () => {
		const stack = fakeStackInfo({
			trunk: "master",
			current: "feature/b",
			ancestors: ["master", "feature/a"],
			descendants: ["feature/c", "feature/d"],
		});
		expect(
			collectStackBranches(stack, {
				current: "feature/b",
				trunk: "master",
				downstackOnly: false,
				includeCurrent: false,
			}),
		).toEqual(["feature/a", "feature/c", "feature/d"]);
	});

	it("collects downstack branches plus current for exec callers", () => {
		const stack = fakeStackInfo({
			trunk: "master",
			current: "feature/b",
			ancestors: ["master", "feature/a"],
			descendants: ["feature/c"],
		});
		expect(
			collectStackBranches(stack, {
				current: "feature/b",
				trunk: "master",
				downstackOnly: true,
				includeCurrent: true,
			}),
		).toEqual(["feature/a", "feature/b"]);
		expect(collectStackEdges(stack, { current: "feature/b", downstackOnly: true })).toEqual([
			{ parent: "master", child: "feature/a" },
			{ parent: "feature/a", child: "feature/b" },
		]);
	});
});

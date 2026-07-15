import { MAX_BRANCH_SLUG_LENGTH } from "@nseng-ai/foundation/branch-slug";
import { describe, expect, test } from "vitest";

import { isValidDispatchAnchorBranch } from "../../src/dispatch/dispatch-run.ts";
import {
	buildDispatchAnchorNameCandidates,
	DISPATCH_ANCHOR_NAME_CANDIDATE_LIMIT,
	formatDispatchAnchorTimestamp,
} from "../../src/ns/dispatch-prompt/anchor-name.ts";

describe("semantic dispatch anchor timestamps", () => {
	test("formats padded Pacific civil time without ambient-timezone punctuation", () => {
		const nowMs = Date.UTC(2026, 6, 15, 14, 18, 14);

		expect(formatDispatchAnchorTimestamp(nowMs, "America/Los_Angeles")).toBe("20260715-071814");
	});

	test("uses the configured zone across a date rollover", () => {
		const nowMs = Date.UTC(2026, 0, 1, 2, 3, 4);

		expect(formatDispatchAnchorTimestamp(nowMs, "UTC")).toBe("20260101-020304");
		expect(formatDispatchAnchorTimestamp(nowMs, "America/Los_Angeles")).toBe("20251231-180304");
	});

	test("documents repeated DST wall time as best-effort chronology with suffix uniqueness", () => {
		const beforeFallback = Date.UTC(2026, 10, 1, 8, 30, 0);
		const afterFallback = Date.UTC(2026, 10, 1, 9, 30, 0);
		const firstTimestamp = formatDispatchAnchorTimestamp(beforeFallback, "America/Los_Angeles");
		const secondTimestamp = formatDispatchAnchorTimestamp(afterFallback, "America/Los_Angeles");

		expect(firstTimestamp).toBe("20261101-013000");
		expect(secondTimestamp).toBe(firstTimestamp);
		const candidates = buildDispatchAnchorNameCandidates("fix-repeated-hour", secondTimestamp);
		expect(candidates[0]?.name).toBe("dispatch/fix-repeated-hour-20261101-013000");
		expect(candidates[1]?.name).toBe("dispatch/fix-repeated-hour-20261101-013000-2");
	});
});

describe("semantic dispatch anchor candidates", () => {
	test("builds the base followed by a bounded -2 through -50 sequence", () => {
		const candidates = buildDispatchAnchorNameCandidates("add-lorem-ipsum", "20260715-071814");

		expect(candidates).toHaveLength(DISPATCH_ANCHOR_NAME_CANDIDATE_LIMIT);
		expect(candidates[0]).toEqual({
			name: "dispatch/add-lorem-ipsum-20260715-071814",
			hasCollisionSuffix: false,
		});
		expect(candidates[1]).toEqual({
			name: "dispatch/add-lorem-ipsum-20260715-071814-2",
			hasCollisionSuffix: true,
		});
		expect(candidates[49]?.name).toBe("dispatch/add-lorem-ipsum-20260715-071814-50");
	});

	test("trims only the semantic slug and keeps complete names valid", () => {
		const candidates = buildDispatchAnchorNameCandidates("x".repeat(400), "20260715-071814");

		expect(candidates[0]?.name).toBe(
			`dispatch/${"x".repeat(MAX_BRANCH_SLUG_LENGTH)}-20260715-071814`,
		);
		expect(candidates.every((candidate) => isValidDispatchAnchorBranch(candidate.name))).toBe(true);
	});
});

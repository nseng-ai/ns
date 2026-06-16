import { describe, expect, test } from "vitest";

import { latestUpdateIsoFromUpdateNames, matchesStatusFilter } from "../../src/operations/list-objectives.ts";

describe("objective list helpers", () => {
	test("matches checkout-local status filters", () => {
		expect(matchesStatusFilter("open", "active")).toBe(true);
		expect(matchesStatusFilter("closed", "active")).toBe(false);
		expect(matchesStatusFilter("open", "open")).toBe(true);
		expect(matchesStatusFilter("closed", "closed")).toBe(true);
		expect(matchesStatusFilter("open", "all")).toBe(true);
		expect(matchesStatusFilter("closed", "all")).toBe(true);
	});

	test("selects latest timestamp-prefixed direct update name deterministically", () => {
		expect(
			latestUpdateIsoFromUpdateNames([
				"2026-06-08-1723-node-runtime-compatibility-hardened.md",
				"notes.md",
				"2026-06-15T223520Z-typescript-package-read-objective.md",
			]),
		).toBe("2026-06-15T22:35:20Z");
	});

	test("returns null when no update name has an accepted timestamp prefix", () => {
		expect(latestUpdateIsoFromUpdateNames(["alpha.md", "zeta.md"])).toBeNull();
	});
});

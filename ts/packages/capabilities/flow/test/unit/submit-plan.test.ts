import { describe, expect, test } from "vitest";

import { buildSubmitPlan, ok, type SubmitStackInspection } from "../../src/submit/index.ts";

const inspected: SubmitStackInspection = {
	currentBranch: "feature/current",
	hasUpstackBranches: true,
	branches: [
		{
			kind: "existing",
			branch: "feature/existing",
			parentBranch: "main",
			pr: { label: "#101", url: "https://github.com/acme/repo/pull/101" },
		},
		{ kind: "new", branch: "feature/current", parentBranch: "feature/existing" },
	],
};

describe("buildSubmitPlan", () => {
	test("preserves existing PR links and submit topology", async () => {
		const result = await buildSubmitPlan({
			cwd: "/repo",
			gateway: { inspectSubmitStack: async () => ok(inspected) },
		});
		expect(result).toEqual({
			kind: "planned",
			plan: {
				currentBranch: "feature/current",
				branches: inspected.branches,
				existingPrLinks: [{ label: "#101", url: "https://github.com/acme/repo/pull/101" }],
				hasUpstackBranches: true,
			},
		});
	});
});

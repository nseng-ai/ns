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
			pr: { number: 101, label: "#101", url: "https://github.com/acme/repo/pull/101" },
		},
		{ kind: "new", branch: "feature/current", parentBranch: "feature/existing" },
	],
};

describe("buildSubmitPlan", () => {
	test("preserves branch-keyed pre-submit state and topology", async () => {
		const result = await buildSubmitPlan({
			cwd: "/repo",
			gateway: { inspectSubmitStack: async () => ok(inspected) },
		});
		expect(result).toEqual({
			kind: "planned",
			plan: {
				currentBranch: "feature/current",
				branches: inspected.branches,
				hasUpstackBranches: true,
			},
		});
	});
});

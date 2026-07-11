import { describe, expect, test } from "vitest";

import {
	buildSubmitPlan,
	planMetadataPrewrite,
	type SubmitStackInspection,
} from "../../src/submit/index.ts";

const existingPr = {
	label: "#101",
	url: "https://github.com/acme/repo/pull/101",
};

function inspection(): SubmitStackInspection {
	return {
		currentBranch: "feature/current",
		hasUpstackBranches: true,
		branches: [
			{
				kind: "existing",
				branch: "feature/existing",
				parentBranch: "main",
				pr: existingPr,
			},
			{
				kind: "new",
				branch: "feature/eligible",
				parentBranch: "feature/existing",
				commitMessages: [{ headline: "Eligible" }],
				diff: "+eligible",
			},
			{
				kind: "new",
				branch: "feature/current",
				parentBranch: "feature/eligible",
				commitMessages: [{ headline: "First" }, { headline: "Second" }],
				diff: "+current",
			},
			{
				kind: "new",
				branch: "feature/off-chain",
				parentBranch: "main",
				commitMessages: [{ headline: "Off chain" }],
				diff: "+off-chain",
			},
		],
	};
}

describe("buildSubmitPlan", () => {
	test("collects submit facts and excludes ineligible metadata branches", async () => {
		const inspected = inspection();
		const gateway = {
			inspectSubmitStack: async () => ({ ok: true, value: inspected }) as const,
		};

		const result = await buildSubmitPlan({ cwd: "/repo", gateway });

		expect(result).toEqual({
			kind: "planned",
			plan: {
				currentBranch: "feature/current",
				branches: inspected.branches,
				existingPrLinks: [existingPr],
				hasUpstackBranches: true,
				metadataPrewriteBranches: [inspected.branches[1]],
				skippedMetadataBranches: [
					inspected.branches[0],
					inspected.branches[2],
					inspected.branches[3],
				],
			},
		});
	});
});

describe("planMetadataPrewrite", () => {
	test("selects only single-commit new branches on the current parent chain", async () => {
		const result = await planMetadataPrewrite(inspection());

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.metadataPrewriteBranches.map((branch) => branch.branch)).toEqual([
			"feature/eligible",
		]);
		expect(result.value.skippedMetadataBranches.map((branch) => branch.branch)).toEqual([
			"feature/existing",
			"feature/current",
			"feature/off-chain",
		]);
	});

	test("reports a current-parent cycle", async () => {
		const result = await planMetadataPrewrite({
			currentBranch: "feature/a",
			hasUpstackBranches: false,
			branches: [
				{
					kind: "new",
					branch: "feature/a",
					parentBranch: "feature/b",
					commitMessages: [{ headline: "A" }],
					diff: "+a",
				},
				{
					kind: "new",
					branch: "feature/b",
					parentBranch: "feature/a",
					commitMessages: [{ headline: "B" }],
					diff: "+b",
				},
			],
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "submit_amendable_parent_cycle" },
		});
	});
});

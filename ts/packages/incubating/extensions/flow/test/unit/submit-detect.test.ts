import { describe, expect, test } from "vitest";

import {
	isRestackNeededProse,
	parseSubmitEmptyBranchWarningBranchName,
	parseSubmitValidationBranchName,
} from "../../src/submit/cli-prose-heuristics.ts";
import {
	detectSubmitSemanticFailureCause,
	parseAheadBehindCounts,
} from "../../src/submit/submit-detect.ts";

describe("submit detection", () => {
	test("detects empty-branch semantic failure only when Graphite says submission was skipped", () => {
		expect(
			detectSubmitSemanticFailureCause(
				[
					"This branch does not introduce any changes:",
					"  ▸ feature-empty",
					"GitHub does not allow empty PRs, so it will not be submitted.",
				].join("\n"),
			),
		).toEqual({ kind: "empty_branch_skipped", branchName: "feature-empty" });

		expect(
			detectSubmitSemanticFailureCause(
				["This branch does not introduce any changes:", "  ▸ feature-empty"].join("\n"),
			),
		).toBeUndefined();
	});

	test("parses branch names from empty-branch and validation blocks", () => {
		expect(
			parseSubmitEmptyBranchWarningBranchName(
				"This branch does not introduce any changes:\n  ▸ feature-empty\n",
			),
		).toBe("feature-empty");
		expect(
			parseSubmitValidationBranchName(
				[
					"Validating that this Graphite stack is ready to submit...",
					"  ▸ feature-validation",
					"📝 Preparing PR body",
				].join("\n"),
			),
		).toBe("feature-validation");
	});

	test("normalizes terminal escapes and carriage returns for detection", () => {
		expect(
			detectSubmitSemanticFailureCause(
				"\u001B[31mThis branch does not introduce any changes:\u001B[0m\r  ▸ feature-empty\rwill not be submitted\r",
			),
		).toEqual({ kind: "empty_branch_skipped", branchName: "feature-empty" });
	});

	test("requires restack language plus submit-required language", () => {
		expect(isRestackNeededProse("The branch was restacked successfully.")).toBe(false);
		expect(isRestackNeededProse("Graphite says this stack must be restacked before submit.")).toBe(
			true,
		);
	});

	test("parses ahead and behind counts conservatively", () => {
		expect(parseAheadBehindCounts("2\t3\n")).toEqual({ aheadCount: 2, behindCount: 3 });
		expect(parseAheadBehindCounts("-1 3\n")).toBeUndefined();
		expect(parseAheadBehindCounts("1.5 3\n")).toBeUndefined();
		expect(parseAheadBehindCounts("nope\n")).toBeUndefined();
	});
});

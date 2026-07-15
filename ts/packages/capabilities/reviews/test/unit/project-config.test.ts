import { describe, expect, test } from "vitest";

import {
	buildGitDiffArgs,
	parseReviewsProjectConfigToml,
	reviewsExcludeGlobsToGitPathspecs,
	type ProjectConfigErrorCode,
} from "../../src/core/project-config.ts";

describe("parseReviewsProjectConfigToml", () => {
	test("loads shared model policy and defaults Reviews to fast", () => {
		const config = expectOk(parseReviewsProjectConfigToml(""));
		expect(config.modelPolicy.profiles.fast?.modelId).toBe("gpt-5.6-luna");
		expect(config.modelPolicy.operations).toEqual({});
	});

	test("parses Reviews diff and shared deep operation", () => {
		const config = expectOk(
			parseReviewsProjectConfigToml(
				'[reviews.diff]\nexclude = ["generated/**"]\n[models.profiles]\ndeep = "anthropic/claude-opus-4-6"\n[models.operations]\n"reviews.deep" = "deep"\n',
			),
		);
		expect(config.diff.exclude).toEqual(["generated/**"]);
		expect(config.modelPolicy.operations["reviews.deep"]).toBe("deep");
	});

	test.each([
		['[reviews.diff]\nexclude = "*.py"\n', "array", "invalid-exclude"],
		['[reviews.diff]\nexclude = ["*.py", 1]\n', "non-empty strings", "invalid-exclude"],
		['[reviews.diff]\nexclude = ["/tmp/*.py"]\n', "repo-relative", "invalid-exclude"],
		[
			'[models.operations]\n"reviews.deep" = "missing"\n',
			"missing profile",
			"invalid-model-policy",
		],
		["[reviews]\n", "", ""],
	] as const)("rejects invalid config %#", (source, message, code) => {
		const result = parseReviewsProjectConfigToml(source, "ns.toml");
		if (code === "") {
			expect(result.ok).toBe(true);
			return;
		}
		const error = expectError(result);
		expect(error.code).toBe(code);
		expect(error.message).toContain(message);
	});
});

describe("git diff pathspec helpers", () => {
	test("converts plain exclude globs", () => {
		expect(reviewsExcludeGlobsToGitPathspecs([".agents/**/*.py"])).toEqual([
			":(exclude,glob).agents/**/*.py",
		]);
	});
	test("builds args with excludes", () => {
		expect(buildGitDiffArgs({ baseRef: "main", excludeGlobs: ["generated/**"] })).toContain(
			":(exclude,glob)generated/**",
		);
	});
});

type ParseResult = ReturnType<typeof parseReviewsProjectConfigToml>;
function expectOk(result: ParseResult) {
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}
function expectError(result: ParseResult): {
	readonly code: ProjectConfigErrorCode;
	readonly message: string;
} {
	if (result.ok) throw new Error("Expected project config to fail.");
	return result.error;
}

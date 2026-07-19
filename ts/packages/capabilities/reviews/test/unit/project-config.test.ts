import { describe, expect, test } from "vitest";

import {
	buildGitDiffArgs,
	parseReviewsProjectConfigToml,
	reviewsExcludeGlobsToGitPathspecs,
	type ProjectConfigErrorCode,
} from "../../src/core/project-config.ts";

describe("parseReviewsProjectConfigToml", () => {
	test("requires the shared fast model profile", () => {
		const error = expectError(parseReviewsProjectConfigToml(""));
		expect(error.code).toBe("invalid-model-policy");
		expect(error.message).toContain("[models.profiles.fast]");
	});

	test("parses Reviews diff and shared model profiles", () => {
		const config = expectOk(
			parseReviewsProjectConfigToml(
				'[reviews.diff]\nexclude = ["generated/**"]\n[models.profiles.fast]\nmodel = "openai/gpt-5.6-luna"\nthinking = "minimal"\n[models.profiles.deep]\nmodel = "anthropic/claude-opus-4-6"\nthinking = "high"\n[models.profiles.architecture]\nmodel = "openai/gpt-5.6-terra"\nthinking = "xhigh"\n',
			),
		);
		expect(config.diff.exclude).toEqual(["generated/**"]);
		expect(config.modelPolicy.profiles.deep).toMatchObject({
			modelId: "claude-opus-4-6",
			thinking: "high",
		});
		expect(config.modelPolicy.profiles.architecture).toMatchObject({
			modelId: "gpt-5.6-terra",
			thinking: "xhigh",
		});
	});

	const fastProfile =
		'[models.profiles.fast]\nmodel = "openai/gpt-5.6-luna"\nthinking = "minimal"\n';
	test.each([
		[`${fastProfile}[reviews.diff]\nexclude = "*.py"\n`, "array", "invalid-exclude"],
		[
			`${fastProfile}[reviews.diff]\nexclude = ["*.py", 1]\n`,
			"non-empty strings",
			"invalid-exclude",
		],
		[`${fastProfile}[reviews.diff]\nexclude = ["/tmp/*.py"]\n`, "repo-relative", "invalid-exclude"],
		[
			`${fastProfile}[models.operations]\ncustom = "missing"\n`,
			"missing profile",
			"invalid-model-policy",
		],
		[`${fastProfile}[reviews]\n`, "", ""],
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

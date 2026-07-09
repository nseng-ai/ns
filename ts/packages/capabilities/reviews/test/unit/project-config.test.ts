import { describe, expect, test } from "vitest";

import {
	buildGitDiffArgs,
	parseReviewsProjectConfigToml,
	reviewsExcludeGlobsToGitPathspecs,
	type ProjectConfigErrorCode,
} from "../../src/core/project-config.ts";

describe("parseReviewsProjectConfigToml", () => {
	test.each([
		["empty TOML", ""],
		["areg-only config", '[areg]\nagents = ["codex", "claude-code"]\n'],
		["missing diff table", "[reviews]\n"],
		["diff table without exclude", "[reviews.diff]\nunknown = true\n"],
	])("returns empty excludes for %s", (_label, source) => {
		const config = expectOk(parseReviewsProjectConfigToml(source));

		expect(config.diff.exclude).toEqual([]);
	});

	test("defaults model profiles to qualified Luna and Terra references", () => {
		const config = expectOk(parseReviewsProjectConfigToml(""));

		expect(config.modelProfiles).toEqual({
			quick: "openai/gpt-5.6-luna",
			deep: "openai/gpt-5.6-terra",
		});
	});

	test("parses reviews diff excludes", () => {
		const config = expectOk(
			parseReviewsProjectConfigToml(
				'[reviews.diff]\nexclude = [".agents/skills/**/*.py", ".claude/skills/**/*.py"]\n',
			),
		);

		expect(config.diff.exclude).toEqual([".agents/skills/**/*.py", ".claude/skills/**/*.py"]);
	});

	test("parses known sections and ignores unrelated fields", () => {
		const config = expectOk(
			parseReviewsProjectConfigToml(
				"[some_future_tool]\n" +
					'enabled = "maybe"\n' +
					"\n" +
					"[areg]\n" +
					'agents = ["codex"]\n' +
					'unknown = "ignored"\n' +
					"\n" +
					"[reviews.diff]\n" +
					'exclude = [".agents/skills/**/*.py"]\n' +
					"unknown = true\n" +
					"\n" +
					"[reviews.model_profiles]\n" +
					'quick = "anthropic/claude-haiku-4-5"\n' +
					'deep = "openai-codex/gpt-5.6-terra"\n',
			),
		);

		expect(config.diff.exclude).toEqual([".agents/skills/**/*.py"]);
		expect(config.modelProfiles).toEqual({
			quick: "anthropic/claude-haiku-4-5",
			deep: "openai-codex/gpt-5.6-terra",
		});
	});

	test.each([
		['[reviews.diff]\nexclude = "*.py"\n', "array", "invalid-exclude"],
		['[reviews.diff]\nexclude = ["*.py", 1]\n', "non-empty strings", "invalid-exclude"],
		['[reviews.diff]\nexclude = [""]\n', "non-empty strings", "invalid-exclude"],
		['[reviews.diff]\nexclude = ["/tmp/*.py"]\n', "repo-relative", "invalid-exclude"],
		['[reviews.diff]\nexclude = ["skills/../*.py"]\n', "path segments", "invalid-exclude"],
		[
			'[reviews.diff]\nexclude = [":(exclude,glob)vendor/**/*.py"]\n',
			"pathspecs",
			"invalid-exclude",
		],
		[
			'[reviews.model_profiles]\nfast = "anthropic/claude-haiku-4-5"\n',
			"unknown profile key(s): fast",
			"invalid-model-profiles",
		],
		[
			'[reviews.model_profiles]\nquick = "haiku"\n',
			"qualified model reference",
			"invalid-model-profiles",
		],
		[
			'[reviews.model_profiles]\nquick = "google/gemini-3-pro"\n',
			"not supported",
			"invalid-model-profiles",
		],
		[
			'[reviews.model_profiles]\nquick = "acme/gpt-5.6-luna"\n',
			"not supported",
			"invalid-model-profiles",
		],
		['reviews = "not a table"\n', "[reviews] must be a TOML table", "invalid-table"],
		['[reviews]\ndiff = "not a table"\n', "[reviews.diff] must be a TOML table", "invalid-table"],
		["[reviews\n", "Invalid TOML", "invalid-toml"],
	] as const)("rejects invalid config %#", (source, message, code) => {
		const error = expectError(parseReviewsProjectConfigToml(source, "ns.toml"));

		expect(error.code).toBe(code);
		expect(error.message).toContain("ns.toml: ");
		expect(error.message).toContain(message);
	});
});

describe("git diff pathspec helpers", () => {
	test("converts plain exclude globs to git exclude pathspecs", () => {
		expect(
			reviewsExcludeGlobsToGitPathspecs([".agents/skills/**/*.py", ".claude/skills/**/*.py"]),
		).toEqual([":(exclude,glob).agents/skills/**/*.py", ":(exclude,glob).claude/skills/**/*.py"]);
	});

	test("builds base git diff args without excludes", () => {
		expect(buildGitDiffArgs({ baseRef: "main" })).toEqual([
			"-c",
			"diff.noprefix=false",
			"-c",
			"diff.mnemonicPrefix=false",
			"-c",
			"diff.srcPrefix=a/",
			"-c",
			"diff.dstPrefix=b/",
			"diff",
			"--no-ext-diff",
			"origin/main...HEAD",
		]);
	});

	test("builds git diff args with pathspec excludes", () => {
		expect(
			buildGitDiffArgs({
				baseRef: "main",
				excludeGlobs: [".agents/skills/**/*.py", ".claude/skills/**/*.py"],
			}),
		).toEqual([
			"-c",
			"diff.noprefix=false",
			"-c",
			"diff.mnemonicPrefix=false",
			"-c",
			"diff.srcPrefix=a/",
			"-c",
			"diff.dstPrefix=b/",
			"diff",
			"--no-ext-diff",
			"origin/main...HEAD",
			"--",
			".",
			":(exclude,glob).agents/skills/**/*.py",
			":(exclude,glob).claude/skills/**/*.py",
		]);
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
	if (result.ok) throw new Error("Expected project config parse to fail.");
	return result.error;
}

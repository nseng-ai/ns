import { describe, expect, test } from "vitest";

import {
	buildGitDiffArgs,
	DEFAULT_ROASTER_MODEL_PROFILES,
	parseRoasterProjectConfigToml,
	resolveModelProfile,
	roasterExcludeGlobsToGitPathspecs,
	type ProjectConfigErrorCode,
	type RoasterProjectConfig,
} from "../../src/project-config.ts";

describe("parseRoasterProjectConfigToml", () => {
	test.each([
		["empty TOML", ""],
		["areg-only config", '[areg]\nagents = ["codex", "claude-code"]\n'],
		["missing roaster tables", "[roaster]\n"],
		["diff table without exclude", "[roaster.diff]\nunknown = true\n"],
	])("returns empty excludes and default model profiles for %s", (_label, source) => {
		const config = expectOk(parseRoasterProjectConfigToml(source));

		expect(config.diff.exclude).toEqual([]);
		expect(config.modelProfiles).toEqual(DEFAULT_ROASTER_MODEL_PROFILES);
		expect(resolveModelProfile(config, "quick")).toBe("haiku");
		expect(resolveModelProfile(config, "deep")).toBe("opus");
	});

	test("parses roaster diff excludes", () => {
		const config = expectOk(
			parseRoasterProjectConfigToml(
				'[roaster.diff]\nexclude = [".agents/skills/**/*.py", ".claude/skills/**/*.py"]\n',
			),
		);

		expect(config.diff.exclude).toEqual([".agents/skills/**/*.py", ".claude/skills/**/*.py"]);
		expect(config.modelProfiles).toEqual(DEFAULT_ROASTER_MODEL_PROFILES);
	});

	test("parses partial and full model profile overrides", () => {
		const partial = expectOk(
			parseRoasterProjectConfigToml('[roaster.model_profiles]\ndeep = "claude-opus-4-5"\n'),
		);
		const full = expectOk(
			parseRoasterProjectConfigToml(
				'[roaster.model_profiles]\nquick = "claude-haiku-4-5"\ndeep = "opus"\n',
			),
		);

		expect(partial.modelProfiles).toEqual({ quick: "haiku", deep: "claude-opus-4-5" });
		expect(full.modelProfiles).toEqual({ quick: "claude-haiku-4-5", deep: "opus" });
	});

	test("parses known sections and ignores unrelated fields", () => {
		const config = expectOk(
			parseRoasterProjectConfigToml(
				"[some_future_tool]\n" +
					'enabled = "maybe"\n' +
					"\n" +
					"[areg]\n" +
					'agents = ["codex"]\n' +
					'unknown = "ignored"\n' +
					"\n" +
					"[roaster]\n" +
					"unknown = true\n" +
					"\n" +
					"[roaster.diff]\n" +
					'exclude = [".agents/skills/**/*.py"]\n' +
					"unknown = true\n" +
					"\n" +
					"[roaster.model_profiles]\n" +
					'quick = "haiku"\n',
			),
		);

		expect(config.diff.exclude).toEqual([".agents/skills/**/*.py"]);
		expect(config.modelProfiles).toEqual({ quick: "haiku", deep: "opus" });
	});

	test.each([
		['[roaster.diff]\nexclude = "*.py"\n', "array", "invalid_exclude"],
		['[roaster.diff]\nexclude = ["*.py", 1]\n', "non-empty strings", "invalid_exclude"],
		['[roaster.diff]\nexclude = [""]\n', "non-empty strings", "invalid_exclude"],
		['[roaster.diff]\nexclude = ["/tmp/*.py"]\n', "repo-relative", "invalid_exclude"],
		['[roaster.diff]\nexclude = ["skills/../*.py"]\n', "path segments", "invalid_exclude"],
		[
			'[roaster.diff]\nexclude = [":(exclude,glob)vendor/**/*.py"]\n',
			"pathspecs",
			"invalid_exclude",
		],
		['roaster = "not a table"\n', "[roaster] must be a TOML table", "invalid_table"],
		['[roaster]\ndiff = "not a table"\n', "[roaster.diff] must be a TOML table", "invalid_table"],
		[
			'[roaster]\nmodel_profiles = "not a table"\n',
			"[roaster.model_profiles] must be a TOML table",
			"invalid_table",
		],
		[
			'[roaster.model_profiles]\nquick = ""\n',
			"quick must be a non-empty string",
			"invalid_model_profiles",
		],
		[
			"[roaster.model_profiles]\ndeep = 123\n",
			"deep must be a non-empty string",
			"invalid_model_profiles",
		],
		[
			'[roaster.model_profiles]\nmedium = "sonnet"\n',
			"unknown profile key",
			"invalid_model_profiles",
		],
		["[roaster\n", "Invalid TOML", "invalid_toml"],
	] as const)("rejects invalid config %#", (source, message, code) => {
		const error = expectError(parseRoasterProjectConfigToml(source, "sdl.toml"));

		expect(error.code).toBe(code);
		expect(error.message).toContain("sdl.toml: ");
		expect(error.message).toContain(message);
	});
});

describe("git diff pathspec helpers", () => {
	test("converts plain exclude globs to git exclude pathspecs", () => {
		expect(
			roasterExcludeGlobsToGitPathspecs([".agents/skills/**/*.py", ".claude/skills/**/*.py"]),
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

type ParseResult = ReturnType<typeof parseRoasterProjectConfigToml>;

function expectOk(result: ParseResult): RoasterProjectConfig {
	if (result.type === "error") throw new Error(result.error.message);
	return result.config;
}

function expectError(result: ParseResult): {
	readonly code: ProjectConfigErrorCode;
	readonly message: string;
} {
	if (result.type === "ok") throw new Error("Expected project config parse to fail.");
	return result.error;
}

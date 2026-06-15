import { describe, expect, test } from "vitest";

import { buildGitDiffArgs, parseRoasterProjectConfigToml, roasterExcludeGlobsToGitPathspecs, type ProjectConfigErrorCode } from "../../src/project-config.ts";

describe("parseRoasterProjectConfigToml", () => {
	test.each([
		["empty TOML", ""],
		["areg-only config", '[areg]\nagents = ["codex", "claude-code"]\n'],
		["missing diff table", "[roaster]\n"],
		["diff table without exclude", "[roaster.diff]\nunknown = true\n"],
	])("returns empty excludes for %s", (_label, source) => {
		const config = expectOk(parseRoasterProjectConfigToml(source));

		expect(config.diff.exclude).toEqual([]);
	});

	test("parses roaster diff excludes", () => {
		const config = expectOk(parseRoasterProjectConfigToml('[roaster.diff]\nexclude = [".agents/skills/**/*.py", ".claude/skills/**/*.py"]\n'));

		expect(config.diff.exclude).toEqual([".agents/skills/**/*.py", ".claude/skills/**/*.py"]);
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
					"[roaster.diff]\n" +
					'exclude = [".agents/skills/**/*.py"]\n' +
					"unknown = true\n",
			),
		);

		expect(config.diff.exclude).toEqual([".agents/skills/**/*.py"]);
	});

	test.each([
		['[roaster.diff]\nexclude = "*.py"\n', "array", "invalid_exclude"],
		['[roaster.diff]\nexclude = ["*.py", 1]\n', "non-empty strings", "invalid_exclude"],
		['[roaster.diff]\nexclude = [""]\n', "non-empty strings", "invalid_exclude"],
		['[roaster.diff]\nexclude = ["/tmp/*.py"]\n', "repo-relative", "invalid_exclude"],
		['[roaster.diff]\nexclude = ["skills/../*.py"]\n', "path segments", "invalid_exclude"],
		['[roaster.diff]\nexclude = [":(exclude,glob)vendor/**/*.py"]\n', "pathspecs", "invalid_exclude"],
		['roaster = "not a table"\n', "[roaster] must be a TOML table", "invalid_table"],
		['[roaster]\ndiff = "not a table"\n', "[roaster.diff] must be a TOML table", "invalid_table"],
		["[roaster\n", "Invalid TOML", "invalid_toml"],
	] as const)("rejects invalid config %#", (source, message, code) => {
		const error = expectError(parseRoasterProjectConfigToml(source, "asdl.toml"));

		expect(error.code).toBe(code);
		expect(error.message).toContain("asdl.toml: ");
		expect(error.message).toContain(message);
	});
});

describe("git diff pathspec helpers", () => {
	test("converts plain exclude globs to git exclude pathspecs", () => {
		expect(roasterExcludeGlobsToGitPathspecs([".agents/skills/**/*.py", ".claude/skills/**/*.py"])).toEqual([
			":(exclude,glob).agents/skills/**/*.py",
			":(exclude,glob).claude/skills/**/*.py",
		]);
	});

	test("builds base git diff args without excludes", () => {
		expect(buildGitDiffArgs({ baseRef: "main" })).toEqual(["diff", "--no-ext-diff", "origin/main...HEAD"]);
	});

	test("builds git diff args with pathspec excludes", () => {
		expect(buildGitDiffArgs({ baseRef: "main", excludeGlobs: [".agents/skills/**/*.py", ".claude/skills/**/*.py"] })).toEqual([
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

function expectOk(result: ParseResult): { readonly diff: { readonly exclude: readonly string[] } } {
	if (result.type === "error") throw new Error(result.error.message);
	return result.config;
}

function expectError(result: ParseResult): { readonly code: ProjectConfigErrorCode; readonly message: string } {
	if (result.type === "ok") throw new Error("Expected project config parse to fail.");
	return result.error;
}

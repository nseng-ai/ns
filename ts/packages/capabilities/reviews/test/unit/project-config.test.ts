import { describe, expect, test } from "vitest";

import type {
	ProjectConfigGateway,
	ProjectConfigReadResult,
} from "@nseng-ai/sdk/project-config/points";

import {
	buildGitDiffArgs,
	loadReviewsProjectConfig,
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

	test("parses Reviews diff and shared model profiles", () => {
		const config = expectOk(
			parseReviewsProjectConfigToml(
				'[reviews.diff]\nexclude = ["generated/**"]\n[models.profiles]\ndeep = "anthropic/claude-opus-4-6"\narchitecture = "openai/gpt-5.6-terra"\n',
			),
		);
		expect(config.diff.exclude).toEqual(["generated/**"]);
		expect(config.modelPolicy.profiles.deep?.modelId).toBe("claude-opus-4-6");
		expect(config.modelPolicy.profiles.architecture?.modelId).toBe("gpt-5.6-terra");
	});

	test.each([
		['[reviews.diff]\nexclude = "*.py"\n', "array", "invalid-exclude"],
		['[reviews.diff]\nexclude = ["*.py", 1]\n', "non-empty strings", "invalid-exclude"],
		['[reviews.diff]\nexclude = ["/tmp/*.py"]\n', "repo-relative", "invalid-exclude"],
		['[models.operations]\ncustom = "missing"\n', "missing profile", "invalid-model-policy"],
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

describe("loadReviewsProjectConfig", () => {
	test("identifies local config read failures", () => {
		const gateway = new ReviewsConfigGateway({}, { "ns.local.toml": "permission denied" });

		const result = loadReviewsProjectConfig({ repoRoot: "/repo", gateway });

		const error = expectError(result);
		expect(error.code).toBe("invalid-table");
		expect(error.message).toContain("Failed to read ns.local.toml");
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
class ReviewsConfigGateway implements ProjectConfigGateway {
	private readonly files: Readonly<Record<string, string>>;
	private readonly readErrors: Readonly<Record<string, string>>;

	constructor(
		files: Readonly<Record<string, string>>,
		readErrors: Readonly<Record<string, string>> = {},
	) {
		this.files = files;
		this.readErrors = readErrors;
	}

	readTextFile(request: { relativePath: string }): ProjectConfigReadResult {
		const readError = this.readErrors[request.relativePath];
		if (readError !== undefined) return { type: "error", message: readError };
		const text = this.files[request.relativePath];
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}

	pathExists(): { type: "missing" } {
		return { type: "missing" };
	}
}

function expectError(result: ParseResult): {
	readonly code: ProjectConfigErrorCode;
	readonly message: string;
} {
	if (result.ok) throw new Error("Expected project config to fail.");
	return result.error;
}

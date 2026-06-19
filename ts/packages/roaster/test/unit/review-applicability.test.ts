import { describe, expect, test } from "vitest";

import type { ReviewApplicability } from "../../src/models.ts";
import {
	applicableReviewKeys,
	pathMatchesPattern,
	reviewAppliesToPaths,
} from "../../src/review-applicability.ts";

describe("pathMatchesPattern", () => {
	test.each([
		["**/*.py", "app.py"],
		["**/*.py", "packages/pkg/src/app.py"],
		["**/tests/**/*.py", "tests/test_x.py"],
		["**/tests/**/*.py", "packages/pkg/tests/unit/test_x.py"],
		["**/*.ts", "ts/packages/pi-extensions/test/planned-branch-extension.test.ts"],
	])("matches %s against %s", (pattern, path) => {
		expect(pathMatchesPattern(path, pattern)).toBe(true);
	});

	test.each([
		["**/*.py", "README.md"],
		["**/tests/**/*.py", "packages/pkg/src/app.py"],
		["*.py", "packages/pkg/src/app.py"],
		["**/*.ts", "packages/pkg/src/app.tsx"],
		["**/*.py", ""],
		["**/*.py", "/app.py"],
		["**/*.py", "../app.py"],
	])("rejects %s against %s", (pattern, path) => {
		expect(pathMatchesPattern(path, pattern)).toBe(false);
	});

	test("supports single-segment wildcards and character classes case-sensitively", () => {
		expect(pathMatchesPattern("src/app.ts", "src/a?p.[tj]s")).toBe(true);
		expect(pathMatchesPattern("src/app.js", "src/a?p.[!t]s")).toBe(true);
		expect(pathMatchesPattern("src/App.ts", "src/a?p.[tj]s")).toBe(false);
	});

	test("normalizes backslashes and leading dot slash", () => {
		expect(pathMatchesPattern(".\\src\\app.py", "./**/*.py")).toBe(true);
	});
});

describe("reviewAppliesToPaths", () => {
	test("review without include is applicable to all diffs", () => {
		const applicability: ReviewApplicability = { include: [], exclude: [] };

		expect(reviewAppliesToPaths(applicability, [])).toBe(true);
		expect(reviewAppliesToPaths(applicability, ["README.md"])).toBe(true);
	});

	test("test-only Python diff does not apply to dignified-python", () => {
		const applicability: ReviewApplicability = {
			include: ["**/*.py"],
			exclude: ["**/tests/**/*.py"],
		};

		expect(
			reviewAppliesToPaths(applicability, [
				"packages/asdl-core/tests/unit/prompts/test_resolver.py",
			]),
		).toBe(false);
	});

	test("source Python diff applies to dignified-python", () => {
		const applicability: ReviewApplicability = {
			include: ["**/*.py"],
			exclude: ["**/tests/**/*.py"],
		};

		expect(
			reviewAppliesToPaths(applicability, ["packages/asdl-core/src/asdl_core/project_config.py"]),
		).toBe(true);
	});

	test("included path still applies when other paths are excluded", () => {
		const applicability: ReviewApplicability = {
			include: ["**/*.py"],
			exclude: ["**/tests/**/*.py"],
		};

		expect(
			reviewAppliesToPaths(applicability, [
				"packages/asdl-core/tests/unit/prompts/test_resolver.py",
				"packages/asdl-core/src/asdl_core/project_config.py",
			]),
		).toBe(true);
	});

	test("non-empty include with no changed paths is not applicable", () => {
		const applicability: ReviewApplicability = { include: ["**/*.py"], exclude: [] };

		expect(reviewAppliesToPaths(applicability, [])).toBe(false);
	});
});

describe("applicableReviewKeys", () => {
	test("returns stable keys whose applicability matches", () => {
		const definitions = {
			python: { applicability: { include: ["**/*.py"], exclude: [] } },
			typescript: { applicability: { include: ["**/*.ts"], exclude: [] } },
			all: { applicability: { include: [], exclude: [] } },
		};

		expect(applicableReviewKeys(definitions, { changedPaths: ["src/app.ts"] })).toEqual([
			"typescript",
			"all",
		]);
	});
});

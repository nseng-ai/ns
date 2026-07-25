import { describe, expect, test } from "vitest";

import { createLocalDiff, type DiffFile, type ReviewApplicability } from "../../src/core/models.ts";
import {
	applicableReviewKeys,
	filterLocalDiffForReviewApplicability,
	pathMatchesPattern,
	reviewAppliesToPaths,
} from "../../src/core/review-applicability.ts";

describe("pathMatchesPattern", () => {
	test.each([
		["**/*.py", "app.py"],
		["**/*.py", "packages/pkg/src/app.py"],
		["**/tests/**/*.py", "tests/test_x.py"],
		["**/tests/**/*.py", "packages/pkg/tests/unit/test_x.py"],
		["**/*.ts", "ts/packages/hosts/pi/test/planned-branch-extension.test.ts"],
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
	test("review without include or exclude is applicable to all diffs", () => {
		const applicability: ReviewApplicability = { include: [], exclude: [] };

		expect(reviewAppliesToPaths(applicability, [])).toBe(true);
		expect(reviewAppliesToPaths(applicability, ["README.md"])).toBe(true);
	});

	test("exclude-only review applies only when a changed path is not excluded", () => {
		const applicability: ReviewApplicability = { include: [], exclude: ["**/*.md"] };

		expect(reviewAppliesToPaths(applicability, ["README.md"])).toBe(false);
		expect(reviewAppliesToPaths(applicability, ["README.md", "src/app.ts"])).toBe(true);
	});

	test("test-only Python diff does not apply to dignified-python-tripwire", () => {
		const applicability: ReviewApplicability = {
			include: ["**/*.py"],
			exclude: ["**/tests/**/*.py"],
		};

		expect(
			reviewAppliesToPaths(applicability, [
				"packages/infra/core/tests/unit/prompts/test_resolver.py",
			]),
		).toBe(false);
	});

	test("source Python diff applies to dignified-python-tripwire", () => {
		const applicability: ReviewApplicability = {
			include: ["**/*.py"],
			exclude: ["**/tests/**/*.py"],
		};

		expect(
			reviewAppliesToPaths(applicability, ["packages/infra/core/src/sdl_core/project_config.py"]),
		).toBe(true);
	});

	test("included path still applies when other paths are excluded", () => {
		const applicability: ReviewApplicability = {
			include: ["**/*.py"],
			exclude: ["**/tests/**/*.py"],
		};

		expect(
			reviewAppliesToPaths(applicability, [
				"packages/infra/core/tests/unit/prompts/test_resolver.py",
				"packages/infra/core/src/sdl_core/project_config.py",
			]),
		).toBe(true);
	});

	test("non-empty include with no changed paths is not applicable", () => {
		const applicability: ReviewApplicability = { include: ["**/*.py"], exclude: [] };

		expect(reviewAppliesToPaths(applicability, [])).toBe(false);
	});
});

describe("filterLocalDiffForReviewApplicability", () => {
	test("keeps only files that contribute to the review's applicability", () => {
		const tsFile = diffFile(
			"src/app.ts",
			"diff --git a/src/app.ts b/src/app.ts\n+const value = 1;\n",
		);
		const markdownFile = diffFile(
			"docs/notes.md",
			"diff --git a/docs/notes.md b/docs/notes.md\n+# Notes\n",
		);
		const testFile = diffFile(
			"src/app.test.ts",
			"diff --git a/src/app.test.ts b/src/app.test.ts\n+test('x', () => {});\n",
		);
		const localDiff = createLocalDiff({
			baseRef: "main",
			diffText: [tsFile.rawText, markdownFile.rawText, testFile.rawText].join(""),
			files: [tsFile, markdownFile, testFile],
		});

		const filtered = filterLocalDiffForReviewApplicability(localDiff, {
			include: ["**/*.ts"],
			exclude: ["**/*.test.ts"],
		});

		expect(filtered.changedPaths).toEqual(["src/app.ts"]);
		expect(filtered.diffText).toBe(tsFile.rawText);
	});

	test("returns unrestricted diffs unchanged", () => {
		const localDiff = createLocalDiff({
			baseRef: "main",
			diffText: "diff --git a/README.md b/README.md\n+# Readme\n",
			files: [diffFile("README.md", "diff --git a/README.md b/README.md\n+# Readme\n")],
		});

		expect(filterLocalDiffForReviewApplicability(localDiff, { include: [], exclude: [] })).toBe(
			localDiff,
		);
	});

	test("exclude-only filtering removes excluded files", () => {
		const readme = diffFile("README.md", "diff --git a/README.md b/README.md\n+# Readme\n");
		const source = diffFile(
			"src/app.ts",
			"diff --git a/src/app.ts b/src/app.ts\n+const value = 1;\n",
		);
		const localDiff = createLocalDiff({
			baseRef: "main",
			diffText: [readme.rawText, source.rawText].join(""),
			files: [readme, source],
		});

		const filtered = filterLocalDiffForReviewApplicability(localDiff, {
			include: [],
			exclude: ["**/*.md"],
		});

		expect(filtered.changedPaths).toEqual(["src/app.ts"]);
		expect(filtered.diffText).toBe(source.rawText);
	});
});

function diffFile(path: string, rawText: string): DiffFile {
	return {
		path,
		oldPath: null,
		changeKind: "modified",
		rawText,
		isBinary: false,
		addedLines: 1,
		removedLines: 0,
		hunkCount: 1,
		byteSize: rawText.length,
		estimatedTokens: 1,
	};
}

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

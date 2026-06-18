import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";

import { estimateTokens, parseUnifiedDiff, type DiffChangeKind } from "../../src/diff-parsing.ts";

const MODIFY_DIFF =
	"diff --git a/app.py b/app.py\n" +
	"index 1111111..2222222 100644\n" +
	"--- a/app.py\n" +
	"+++ b/app.py\n" +
	"@@ -1,2 +1,3 @@\n" +
	" import os\n" +
	"-print('old')\n" +
	"+print('new')\n" +
	"+print('extra')\n";

const ADD_DIFF =
	"diff --git a/new.py b/new.py\n" +
	"new file mode 100644\n" +
	"index 0000000..1111111\n" +
	"--- /dev/null\n" +
	"+++ b/new.py\n" +
	"@@ -0,0 +1,2 @@\n" +
	"+one\n" +
	"+two\n";

const DELETE_DIFF =
	"diff --git a/old.py b/old.py\n" +
	"deleted file mode 100644\n" +
	"index 1111111..0000000\n" +
	"--- a/old.py\n" +
	"+++ /dev/null\n" +
	"@@ -1,2 +0,0 @@\n" +
	"-one\n" +
	"-two\n";

const PURE_RENAME_DIFF =
	"diff --git a/old_name.py b/new_name.py\n" +
	"similarity index 100%\n" +
	"rename from old_name.py\n" +
	"rename to new_name.py\n";

const RENAME_WITH_CONTENT_DIFF =
	"diff --git a/old_name.py b/new_name.py\n" +
	"similarity index 88%\n" +
	"rename from old_name.py\n" +
	"rename to new_name.py\n" +
	"index 1111111..2222222 100644\n" +
	"--- a/old_name.py\n" +
	"+++ b/new_name.py\n" +
	"@@ -1 +1,2 @@\n" +
	"-old\n" +
	"+new\n" +
	"+extra\n";

const COPY_DIFF =
	"diff --git a/template.py b/generated.py\n" +
	"similarity index 100%\n" +
	"copy from template.py\n" +
	"copy to generated.py\n";

const COPY_WITH_CONTENT_DIFF =
	"diff --git a/template.py b/generated.py\n" +
	"similarity index 88%\n" +
	"copy from template.py\n" +
	"copy to generated.py\n" +
	"index 1111111..2222222 100644\n" +
	"--- a/template.py\n" +
	"+++ b/generated.py\n" +
	"@@ -1 +1,2 @@\n" +
	"-old\n" +
	"+new\n" +
	"+extra\n";

const PREFIXED_RENAME_METADATA_DIFF =
	"diff --git a/a/foo.txt b/a/bar.txt\n" +
	"similarity index 100%\n" +
	"rename from a/foo.txt\n" +
	"rename to a/bar.txt\n";

const PREFIXED_COPY_METADATA_DIFF =
	"diff --git a/b/source.txt b/b/generated.txt\n" +
	"similarity index 100%\n" +
	"copy from b/source.txt\n" +
	"copy to b/generated.txt\n";

const BINARY_DIFF =
	"diff --git a/image.png b/image.png\n" +
	"new file mode 100644\n" +
	"index 0000000..1111111\n" +
	"Binary files /dev/null and b/image.png differ\n";

const QUOTED_PATH_DIFF =
	'diff --git "a/spaced/\\303\\251 file.txt" "b/spaced/\\303\\251 file.txt"\n' +
	'--- "a/spaced/\\303\\251 file.txt"\n' +
	'+++ "b/spaced/\\303\\251 file.txt"\n' +
	"@@ -1 +1 @@\n" +
	"-old\n" +
	"+new\n";

const QUOTED_EMOJI_PATH_DIFF =
	'diff --git "a/spaced/😀 file.txt" "b/spaced/😀 file.txt"\n' +
	'--- "a/spaced/😀 file.txt"\n' +
	'+++ "b/spaced/😀 file.txt"\n' +
	"@@ -1 +1 @@\n" +
	"-old\n" +
	"+new\n";

interface ParserCase {
	diffText: string;
	changeKind: DiffChangeKind;
	path: string;
	oldPath: string | null;
	isBinary: boolean;
	addedLines: number;
	removedLines: number;
	hunkCount: number;
}

const PARSER_CASES: readonly ParserCase[] = [
	{
		diffText: MODIFY_DIFF,
		changeKind: "modified",
		path: "app.py",
		oldPath: null,
		isBinary: false,
		addedLines: 2,
		removedLines: 1,
		hunkCount: 1,
	},
	{
		diffText: ADD_DIFF,
		changeKind: "added",
		path: "new.py",
		oldPath: null,
		isBinary: false,
		addedLines: 2,
		removedLines: 0,
		hunkCount: 1,
	},
	{
		diffText: DELETE_DIFF,
		changeKind: "deleted",
		path: "old.py",
		oldPath: null,
		isBinary: false,
		addedLines: 0,
		removedLines: 2,
		hunkCount: 1,
	},
	{
		diffText: PURE_RENAME_DIFF,
		changeKind: "renamed",
		path: "new_name.py",
		oldPath: "old_name.py",
		isBinary: false,
		addedLines: 0,
		removedLines: 0,
		hunkCount: 0,
	},
	{
		diffText: RENAME_WITH_CONTENT_DIFF,
		changeKind: "renamed",
		path: "new_name.py",
		oldPath: "old_name.py",
		isBinary: false,
		addedLines: 2,
		removedLines: 1,
		hunkCount: 1,
	},
	{
		diffText: COPY_DIFF,
		changeKind: "copied",
		path: "generated.py",
		oldPath: "template.py",
		isBinary: false,
		addedLines: 0,
		removedLines: 0,
		hunkCount: 0,
	},
	{
		diffText: COPY_WITH_CONTENT_DIFF,
		changeKind: "copied",
		path: "generated.py",
		oldPath: "template.py",
		isBinary: false,
		addedLines: 2,
		removedLines: 1,
		hunkCount: 1,
	},
	{
		diffText: PREFIXED_RENAME_METADATA_DIFF,
		changeKind: "renamed",
		path: "a/bar.txt",
		oldPath: "a/foo.txt",
		isBinary: false,
		addedLines: 0,
		removedLines: 0,
		hunkCount: 0,
	},
	{
		diffText: PREFIXED_COPY_METADATA_DIFF,
		changeKind: "copied",
		path: "b/generated.txt",
		oldPath: "b/source.txt",
		isBinary: false,
		addedLines: 0,
		removedLines: 0,
		hunkCount: 0,
	},
	{
		diffText: BINARY_DIFF,
		changeKind: "added",
		path: "image.png",
		oldPath: null,
		isBinary: true,
		addedLines: 0,
		removedLines: 0,
		hunkCount: 0,
	},
	{
		diffText: QUOTED_PATH_DIFF,
		changeKind: "modified",
		path: "spaced/\\303\\251 file.txt",
		oldPath: null,
		isBinary: false,
		addedLines: 1,
		removedLines: 1,
		hunkCount: 1,
	},
	{
		diffText: QUOTED_EMOJI_PATH_DIFF,
		changeKind: "modified",
		path: "spaced/😀 file.txt",
		oldPath: null,
		isBinary: false,
		addedLines: 1,
		removedLines: 1,
		hunkCount: 1,
	},
];

describe("parseUnifiedDiff", () => {
	test.each(PARSER_CASES)("parses $changeKind metadata and metrics for $path", (parserCase) => {
		const files = parseUnifiedDiff(parserCase.diffText);

		expect(files).toHaveLength(1);
		const file = files[0];
		expect(file).toBeDefined();
		expect(file?.changeKind).toBe(parserCase.changeKind);
		expect(file?.path).toBe(parserCase.path);
		expect(file?.oldPath).toBe(parserCase.oldPath);
		expect(file?.rawText).toBe(parserCase.diffText);
		expect(file?.isBinary).toBe(parserCase.isBinary);
		expect(file?.addedLines).toBe(parserCase.addedLines);
		expect(file?.removedLines).toBe(parserCase.removedLines);
		expect(file?.hunkCount).toBe(parserCase.hunkCount);
		expect(file?.byteSize).toBe(Buffer.byteLength(parserCase.diffText, "utf8"));
		expect(file?.estimatedTokens).toBe(estimateTokens(parserCase.diffText));
	});

	test("handles multiple files in order", () => {
		const files = parseUnifiedDiff(MODIFY_DIFF + DELETE_DIFF + PURE_RENAME_DIFF);

		expect(files.map((file) => file.path)).toEqual(["app.py", "old.py", "new_name.py"]);
		expect(files.map((file) => file.changeKind)).toEqual(["modified", "deleted", "renamed"]);
	});

	test("round-trips raw text for normal multi-file input", () => {
		const diffText = MODIFY_DIFF + ADD_DIFF + DELETE_DIFF + PURE_RENAME_DIFF + BINARY_DIFF;

		const files = parseUnifiedDiff(diffText);

		expect(files.map((file) => file.rawText).join("")).toBe(diffText);
	});

	test("does not strip a real directory named like a canonical git prefix twice", () => {
		const diffText =
			"diff --git a/a/file.txt b/a/file.txt\n" +
			"--- a/a/file.txt\n" +
			"+++ b/a/file.txt\n" +
			"@@ -1 +1 @@\n" +
			"-old\n" +
			"+new\n";

		const files = parseUnifiedDiff(diffText);

		expect(files[0]?.path).toBe("a/file.txt");
	});

	test("does not treat hunk body lines that start with file-header markers as headers", () => {
		const diffText =
			"diff --git a/schema.sql b/schema.sql\n" +
			"--- a/schema.sql\n" +
			"+++ b/schema.sql\n" +
			"@@ -1,2 +1 @@\n" +
			"---- drop table users;\n" +
			" SELECT 1;\n";

		const files = parseUnifiedDiff(diffText);

		expect(files[0]?.path).toBe("schema.sql");
		expect(files[0]?.removedLines).toBe(1);
		expect(files[0]?.addedLines).toBe(0);
		expect(files[0]?.rawText).toBe(diffText);
	});

	test.each(["", "\n", "  \n\t"])(
		"returns no files for empty or whitespace input %#",
		(diffText) => {
			expect(parseUnifiedDiff(diffText)).toEqual([]);
		},
	);

	test("returns no files for unexpected non-git segments", () => {
		expect(parseUnifiedDiff("not a git diff\n+but still text\n")).toEqual([]);
	});

	test("uses line-based checks while retaining CRLF raw text", () => {
		const diffText = BINARY_DIFF.replaceAll("\n", "\r\n");

		const files = parseUnifiedDiff(diffText);

		expect(files[0]?.rawText).toBe(diffText);
		expect(files[0]?.isBinary).toBe(true);
		expect(files[0]?.byteSize).toBe(Buffer.byteLength(diffText, "utf8"));
	});
});

describe("estimateTokens", () => {
	test("uses ceil of Unicode code-point length divided by four", () => {
		expect(estimateTokens("")).toBe(0);
		expect(estimateTokens("a")).toBe(1);
		expect(estimateTokens("abcd")).toBe(1);
		expect(estimateTokens("abcde")).toBe(2);
		expect(estimateTokens("x".repeat(41))).toBe(Math.ceil(41 / 4));
		expect(estimateTokens("😀😀😀😀")).toBe(1);
		expect(estimateTokens("😀😀😀😀😀")).toBe(2);
	});

	test("is monotonic", () => {
		const texts = ["", "a", "abcd", "abcde", "abcdefghi", "abcdefghi😀"];

		const estimates = texts.map(estimateTokens);

		expect(estimates).toEqual([...estimates].sort((left, right) => left - right));
	});
});

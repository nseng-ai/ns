import { describe, expect, test } from "vitest";

import { firstLineEnding, splitLinesKeepEndings, splitMarkdownFrontmatter, stripLineEnding } from "@asdl/core/markdown-frontmatter";

describe("markdown frontmatter bounds", () => {
	test("finds exact first-line frontmatter and returns slices", () => {
		const result = splitMarkdownFrontmatter("---\ntitle: Demo\n---\n# Body\n");

		expect(result).toEqual({
			type: "found",
			block: {
				linesWithEndings: ["---\n", "title: Demo\n", "---\n", "# Body\n"],
				openingIndex: 0,
				closingIndex: 2,
				frontmatterLinesWithEndings: ["title: Demo\n"],
				frontmatterText: "title: Demo\n",
				body: "# Body\n",
				lineEnding: "\n",
			},
		});
	});

	test("supports CRLF and reports the first source line ending", () => {
		const result = splitMarkdownFrontmatter("---\r\ntitle: Demo\r\n---\r\nBody\r\n");

		expect(result.type).toBe("found");
		if (result.type !== "found") return;
		expect(result.block.lineEnding).toBe("\r\n");
		expect(result.block.frontmatterText).toBe("title: Demo\r\n");
		expect(result.block.body).toBe("Body\r\n");
	});

	test.each(["", "\n---\n---\n", " ---\n---\n", "--- \n---\n", "# Body\n---\n"])("returns not_found when opening fence is not exact first line: %j", (source) => {
		expect(splitMarkdownFrontmatter(source)).toEqual({ type: "not_found" });
	});

	test("returns missing_closing_fence when exact opening has no exact later close", () => {
		expect(splitMarkdownFrontmatter("---\ntitle: Demo\n--- \nBody\n")).toEqual({ type: "missing_closing_fence" });
	});

	test.each(["---\ntitle: Demo\n ---\n", "---\ntitle: Demo\n----\n", "---\nprose --- here\n"])("does not treat near fences as closing fences: %j", (source) => {
		expect(splitMarkdownFrontmatter(source)).toEqual({ type: "missing_closing_fence" });
	});

	test("line helpers preserve endings and strip only line endings", () => {
		expect(splitLinesKeepEndings("a\r\nb\nc")).toEqual(["a\r\n", "b\n", "c"]);
		expect(stripLineEnding("--- \r\n")).toBe("--- ");
		expect(firstLineEnding("abc")).toBeUndefined();
		expect(firstLineEnding("a\nb\r\n")).toBe("\n");
	});
});

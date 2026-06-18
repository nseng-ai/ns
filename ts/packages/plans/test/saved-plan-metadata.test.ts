import { describe, expect, test } from "vitest";

import { mergeSavedPlanTags, normalizePlanTags, parseSavedPlanTags, validatePlanTag } from "../src/index.ts";

describe("saved-plan tag metadata", () => {
	test("parses supported tags and treats untagged or unrelated frontmatter as untagged", () => {
		expect(parseSavedPlanTags("# Plan\n")).toEqual([]);
		expect(
			parseSavedPlanTags(["---", "summary: Useful", "---", "", "# Plan", ""].join("\n")),
		).toEqual([]);
		expect(
			parseSavedPlanTags(["---", "tags:", "  - follow-up", "  - architecture", "---", "", "# Plan", ""].join("\n")),
		).toEqual(["follow-up", "architecture"]);
	});

	test("malformed read metadata is ignored", () => {
		expect(parseSavedPlanTags(["---", "tags:", "  - Follow-Up", "---", "", "# Plan", ""].join("\n"))).toEqual([]);
		expect(parseSavedPlanTags(["---", "tags: [follow-up]", "---", "", "# Plan", ""].join("\n"))).toEqual([]);
	});

	test("parses tags from CRLF frontmatter", () => {
		expect(parseSavedPlanTags("---\r\ntags:\r\n  - follow-up\r\n---\r\n\r\n# Plan\r\n")).toEqual(["follow-up"]);
	});

	test.each(["", "Follow-Up", "follow_up", "follow up", "follow--up", "-follow-up", "follow-up-", "follow/up", "plan.md"])(
		"rejects invalid tag %j",
		(tag) => {
			expect(validatePlanTag(tag)).toBeDefined();
		},
	);

	test("normalizes supplied tags by validating and deduping in order", () => {
		expect(normalizePlanTags(["follow-up", "architecture", "follow-up"])).toEqual({
			type: "ok",
			tags: ["follow-up", "architecture"],
		});
		expect(normalizePlanTags([" follow-up"])).toEqual({
			type: "invalid",
			tag: " follow-up",
			message: "Tag must not include leading or trailing whitespace.",
		});
	});

	test("injects frontmatter when supplied tags are added to untagged content", () => {
		const result = mergeSavedPlanTags("# Plan\n", ["follow-up", "architecture"]);

		expect(result).toEqual({
			type: "ok",
			content: ["---", "tags:", "  - follow-up", "  - architecture", "---", "", "# Plan", ""].join("\n"),
			tags: ["follow-up", "architecture"],
		});
	});

	test("merges and dedupes existing frontmatter tags", () => {
		const content = ["---", "summary: Useful", "tags:", "  - follow-up", "---", "", "# Plan", ""].join("\n");
		const result = mergeSavedPlanTags(content, ["architecture", "follow-up"]);

		expect(result).toEqual({
			type: "ok",
			content: ["---", "summary: Useful", "tags:", "  - follow-up", "  - architecture", "---", "", "# Plan", ""].join("\n"),
			tags: ["follow-up", "architecture"],
		});
	});

	test("merges tags from CRLF frontmatter through the shared frontmatter splitter", () => {
		const result = mergeSavedPlanTags("---\r\nsummary: Useful\r\ntags:\r\n  - follow-up\r\n---\r\n\r\n# Plan\r\n", ["architecture"]);

		expect(result).toEqual({
			type: "ok",
			content: ["---", "summary: Useful", "tags:", "  - follow-up", "  - architecture", "---", "", "# Plan", ""].join("\n"),
			tags: ["follow-up", "architecture"],
		});
	});

	test("returns explicit errors for supplied or existing malformed tags during merge", () => {
		expect(mergeSavedPlanTags("# Plan\n", ["Follow-Up"])).toMatchObject({ type: "invalid-tags" });
		expect(
			mergeSavedPlanTags(["---", "tags:", "  - Follow-Up", "---", "", "# Plan", ""].join("\n"), ["follow-up"]),
		).toEqual({ type: "invalid-tags", message: "Existing frontmatter has malformed tags metadata." });
	});
});

import { describe, expect, test } from "vitest";

import { mergeSavedPlanTags, parseSavedPlanTags, validatePlanTag } from "../src/index.ts";

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

	test.each(["", "Follow-Up", "follow_up", "follow up", "follow--up", "-follow-up", "follow-up-", "follow/up", "plan.md"])(
		"rejects invalid tag %j",
		(tag) => {
			expect(validatePlanTag(tag)).toBeDefined();
		},
	);

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

	test("returns explicit errors for supplied or existing malformed tags during merge", () => {
		expect(mergeSavedPlanTags("# Plan\n", ["Follow-Up"])).toMatchObject({ type: "invalid-tags" });
		expect(
			mergeSavedPlanTags(["---", "tags:", "  - Follow-Up", "---", "", "# Plan", ""].join("\n"), ["follow-up"]),
		).toEqual({ type: "invalid-tags", message: "Existing frontmatter has malformed tags metadata." });
	});
});

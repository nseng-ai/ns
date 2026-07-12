import { describe, expect, test } from "vitest";

import {
	normalizeHandoffSelectorToKey,
	resolveHandoffSelection,
	splitHandoffSelectorTerms,
} from "@nseng-ai/handoffs/api";

const keys = [
	"address-review-feedback.md",
	"add-pickup-handoff-command.md",
	"associate-sessions-with-branches.md",
];

function resolveKeys(selector: readonly string[], items: readonly string[] = keys) {
	return resolveHandoffSelection(selector, items, (key) => key);
}

describe("resolveHandoffSelection", () => {
	test("returns none when no handoffs exist", () => {
		expect(resolveKeys(["anything"], [])).toEqual({ resolution: "none", candidates: [] });
	});

	test("empty selector picks the only handoff and is ambiguous otherwise", () => {
		expect(resolveKeys([], ["only-one.md"])).toEqual({
			resolution: "unique",
			matchedBy: "only-handoff",
			selected: "only-one.md",
			candidates: ["only-one.md"],
		});
		expect(resolveKeys([])).toEqual({ resolution: "ambiguous", candidates: keys });
	});

	test("an exact key selector wins before term matching", () => {
		expect(resolveKeys(["address-review-feedback.md"])).toMatchObject({
			resolution: "unique",
			matchedBy: "exact-key",
			selected: "address-review-feedback.md",
		});
	});

	test("a slug selector normalizes to its key", () => {
		expect(resolveKeys(["add-pickup-handoff-command"])).toMatchObject({
			resolution: "unique",
			matchedBy: "normalized-slug",
			selected: "add-pickup-handoff-command.md",
		});
	});

	test("terms must all appear among the slug's words", () => {
		expect(resolveKeys(["review", "feedback"])).toMatchObject({
			resolution: "unique",
			matchedBy: "terms",
			selected: "address-review-feedback.md",
		});
		expect(resolveKeys(["sessions"])).toMatchObject({
			resolution: "unique",
			matchedBy: "terms",
			selected: "associate-sessions-with-branches.md",
		});
		expect(resolveKeys(["add"])).toMatchObject({
			resolution: "unique",
			selected: "add-pickup-handoff-command.md",
		});
		expect(resolveKeys(["review", "command"])).toEqual({
			resolution: "none",
			candidates: [],
		});
	});

	test("multiple term matches are ambiguous", () => {
		expect(resolveKeys(["handoff"], ["alpha-handoff.md", "beta-handoff.md"])).toEqual({
			resolution: "ambiguous",
			candidates: ["alpha-handoff.md", "beta-handoff.md"],
		});
	});

	test("selectors that split to no terms resolve to none", () => {
		expect(resolveKeys(["---"])).toEqual({ resolution: "none", candidates: [] });
	});

	test("duplicate keys across items are ambiguous even for exact selectors", () => {
		const items = [
			{ branch: "feat/x", key: "resume-plan.md" },
			{ branch: "feat/y", key: "resume-plan.md" },
		];
		const selection = resolveHandoffSelection(["resume-plan"], items, (item) => item.key);
		expect(selection.resolution).toBe("ambiguous");
		expect(selection.candidates).toHaveLength(2);
	});
});

describe("selection helpers", () => {
	test("splitHandoffSelectorTerms lowercases and splits on separators", () => {
		expect(splitHandoffSelectorTerms(["Address-Review", "feedback.md"])).toEqual([
			"address",
			"review",
			"feedback",
			"md",
		]);
		expect(splitHandoffSelectorTerms(["---"])).toEqual([]);
	});

	test("normalizeHandoffSelectorToKey appends the key suffix and rejects paths", () => {
		expect(normalizeHandoffSelectorToKey("alpha")).toBe("alpha.md");
		expect(normalizeHandoffSelectorToKey("alpha.md")).toBe("alpha.md");
		expect(normalizeHandoffSelectorToKey("Bad.md")).toBeUndefined();
		expect(normalizeHandoffSelectorToKey("nested/alpha")).toBeUndefined();
		expect(normalizeHandoffSelectorToKey("  ")).toBeUndefined();
	});
});

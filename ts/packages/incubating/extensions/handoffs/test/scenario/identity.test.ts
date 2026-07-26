import { describe, expect, test } from "vitest";

import {
	HANDOFF_KEY_SUFFIX,
	HANDOFF_NAMESPACE,
	deriveSemanticHandoffSlug,
	handoffKeyFromSlug,
	handoffKeyToSlug,
	handoffSlugToKey,
	isHandoffKey,
	normalizeHandoffSlugInput,
	parseFlatHandoffSlug,
} from "@nseng-ai/handoffs/identity";

describe("handoff identity", () => {
	test("exports the handoff storage constants", () => {
		expect(HANDOFF_NAMESPACE).toBe("handoff");
		expect(HANDOFF_KEY_SUFFIX).toBe(".md");
	});

	test("accepts strict semantic slugs and keys", () => {
		expect(parseFlatHandoffSlug("alpha-123")).toEqual({ type: "valid", slug: "alpha-123" });
		expect(handoffSlugToKey("alpha-123")).toBe("alpha-123.md");
		expect(handoffKeyToSlug("alpha-123.md")).toBe("alpha-123");
		expect(isHandoffKey("alpha-123.md")).toBe(true);
		expect(handoffKeyFromSlug("alpha-123")).toEqual({ type: "ok", value: "alpha-123.md" });
	});

	test("rejects flat Branch Memory keys that are not strict handoff artifact keys", () => {
		expect(isHandoffKey("alpha_beta.md")).toBe(false);
		expect(isHandoffKey("Alpha.md")).toBe(false);
		expect(isHandoffKey("alpha--beta.md")).toBe(false);
		expect(isHandoffKey("nested/alpha.md")).toBe(false);
		expect(isHandoffKey("not-md.txt")).toBe(false);
	});

	test("normalizes raw handoff names into valid slugs", () => {
		expect(normalizeHandoffSlugInput("Address Review: Feedback!")).toEqual({
			type: "valid",
			slug: "address-review-feedback",
			requestedSlug: "Address Review: Feedback!",
			changed: true,
		});
		expect(normalizeHandoffSlugInput("already-valid-slug")).toEqual({
			type: "valid",
			slug: "already-valid-slug",
			requestedSlug: "already-valid-slug",
			changed: false,
		});
		expect(normalizeHandoffSlugInput("  padded name  ")).toEqual({
			type: "valid",
			slug: "padded-name",
			requestedSlug: "padded name",
			changed: true,
		});
		expect(normalizeHandoffSlugInput("alpha.md")).toEqual({
			type: "valid",
			slug: "alpha",
			requestedSlug: "alpha.md",
			changed: true,
		});
		expect(normalizeHandoffSlugInput("nested/alpha")).toEqual({
			type: "valid",
			slug: "nested-alpha",
			requestedSlug: "nested/alpha",
			changed: true,
		});
	});

	test("does not truncate long normalized slugs", () => {
		expect(normalizeHandoffSlugInput("one two three four five six seven eight nine ten")).toEqual({
			type: "valid",
			slug: "one-two-three-four-five-six-seven-eight-nine-ten",
			requestedSlug: "one two three four five six seven eight nine ten",
			changed: true,
		});
	});

	test("rejects names that normalize to an empty slug", () => {
		expect(normalizeHandoffSlugInput("")).toMatchObject({ type: "invalid" });
		expect(normalizeHandoffSlugInput("   ")).toMatchObject({ type: "invalid" });
		expect(normalizeHandoffSlugInput("!!!")).toMatchObject({ type: "invalid" });
		expect(normalizeHandoffSlugInput(".md")).toMatchObject({ type: "invalid" });
	});

	test("derives semantic slugs with the shared rule", () => {
		expect(deriveSemanticHandoffSlug("Finish handoff tab implementation!!!")).toBe(
			"finish-handoff-tab-implementation",
		);
		expect(deriveSemanticHandoffSlug("one two three four five six seven eight nine ten")).toBe(
			"one-two-three-four-five-six-seven-eight",
		);
		expect(deriveSemanticHandoffSlug("!!!")).toBeUndefined();
	});
});

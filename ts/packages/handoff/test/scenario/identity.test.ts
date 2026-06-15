import { describe, expect, test } from "vitest";

import {
	HANDOFF_KEY_SUFFIX,
	HANDOFF_NAMESPACE,
	deriveSemanticHandoffSlug,
	handoffKeyFromSlug,
	handoffKeyToSlug,
	handoffSlugToKey,
	isHandoffKey,
	parseFlatHandoffSlug,
} from "@asdl/handoff/identity";

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

	test("derives semantic slugs with the shared rule", () => {
		expect(deriveSemanticHandoffSlug("Finish handoff tab implementation!!!")).toBe("finish-handoff-tab-implementation");
		expect(deriveSemanticHandoffSlug("one two three four five six seven eight nine ten")).toBe("one-two-three-four-five-six-seven-eight");
		expect(deriveSemanticHandoffSlug("!!!")).toBeUndefined();
	});
});

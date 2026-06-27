import { describe, expect, test } from "vitest";

import {
	HANDOFF_KEY_SUFFIX,
	HANDOFF_NAMESPACE,
	branchStateSchema,
	deleteHandoffArtifact,
	deriveSemanticHandoffSlug,
	executeDeletedBranchGarbageCollection,
	handoffKeyFromSlug,
	handoffKeyToSlug,
	handoffSlugFromKey,
	handoffSlugToKey,
	handoffSummarySchema,
	isHandoffKey,
	listHandoffSummaries,
	parseFlatHandoffSlug,
	planDeletedBranchGarbageCollection,
	prepareHandoffDeletion,
} from "../../src/api.ts";

describe("@sdl/handoff/api", () => {
	test("exports identity helpers and schemas", () => {
		expect(HANDOFF_NAMESPACE).toBe("handoff");
		expect(HANDOFF_KEY_SUFFIX).toBe(".md");
		expect(deriveSemanticHandoffSlug("Pick up handoff flow")).toBe("pick-up-handoff-flow");
		expect(handoffKeyFromSlug("pick-up-handoff-flow")).toEqual({
			type: "ok",
			value: "pick-up-handoff-flow.md",
		});
		expect(handoffKeyToSlug("pick-up-handoff-flow.md")).toBe("pick-up-handoff-flow");
		expect(handoffSlugFromKey("pick-up-handoff-flow.md")).toBe("pick-up-handoff-flow");
		expect(handoffSlugToKey("pick-up-handoff-flow")).toBe("pick-up-handoff-flow.md");
		expect(isHandoffKey("pick-up-handoff-flow.md")).toBe(true);
		expect(parseFlatHandoffSlug("pick-up-handoff-flow")).toEqual({
			type: "valid",
			slug: "pick-up-handoff-flow",
		});
		expect(branchStateSchema.parse("active")).toBe("active");
		expect(
			handoffSummarySchema.parse({
				branch: "feature/handoff",
				branch_state: "active",
				slug: "pick-up-handoff-flow",
				key: "pick-up-handoff-flow.md",
				entry_locator: "refs/brmem/ns/handoff/feature/handoff:pick-up-handoff-flow.md",
				updated_at: "2026-01-01T00:00:00Z",
			}),
		).toMatchObject({ slug: "pick-up-handoff-flow" });
	});

	test("exports storage and garbage-collection cores", () => {
		expect(typeof listHandoffSummaries).toBe("function");
		expect(typeof prepareHandoffDeletion).toBe("function");
		expect(typeof deleteHandoffArtifact).toBe("function");
		expect(typeof planDeletedBranchGarbageCollection).toBe("function");
		expect(typeof executeDeletedBranchGarbageCollection).toBe("function");
	});
});

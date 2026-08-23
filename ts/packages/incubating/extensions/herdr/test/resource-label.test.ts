import { describe, expect, test } from "vitest";

import { formatHerdrResourceLabel, HERDR_RESOURCE_LABEL_POLICY } from "@nseng-ai/herdr/api";

describe("Herdr resource labels", () => {
	test("commits to an action-neutral semantic-label policy for creation and goal rename", () => {
		expect(HERDR_RESOURCE_LABEL_POLICY.promptIntroLines.join("\n")).toContain(
			"description or goal",
		);
		expect(HERDR_RESOURCE_LABEL_POLICY.promptIntroLines.join("\n")).toContain(
			"not the act of creating or renaming",
		);
		expect(HERDR_RESOURCE_LABEL_POLICY.normalization).toEqual({
			maxWords: 6,
			stripSuffixes: ["-workspace", "-space", "-tab"],
		});
		expect(HERDR_RESOURCE_LABEL_POLICY.maxContentChars).toBe(8_000);
		expect(HERDR_RESOURCE_LABEL_POLICY.noFallbackLine).toContain("No deterministic");
	});

	test("validates flat lowercase ASCII kebab labels within the word cap", () => {
		expect(HERDR_RESOURCE_LABEL_POLICY.validateSlug("ship-auth-refactor")).toBeUndefined();
		expect(HERDR_RESOURCE_LABEL_POLICY.validateSlug("Ship_auth")).toContain("flat lowercase ASCII");
		expect(HERDR_RESOURCE_LABEL_POLICY.validateSlug("one-two-three-four-five-six-seven")).toContain(
			"at most 6 words",
		);
	});

	test("composes compact Slot and unprefixed resource labels", () => {
		expect(formatHerdrResourceLabel({ semanticLabel: "review-api", slotSlug: "slot-04" })).toBe(
			"s4:review-api",
		);
		expect(formatHerdrResourceLabel({ semanticLabel: "review-api" })).toBe("review-api");
	});
});

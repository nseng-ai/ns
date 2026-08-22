import { describe, expect, test } from "vitest";

import {
	formatHerdrResourceLabel,
	HERDR_RESOURCE_LABEL_POLICY,
	slotLabelInputFromWorktreeRoot,
} from "@nseng-ai/herdr/api";

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

	test("recognizes only canonical managed Slot worktree roots", () => {
		const worktreeRoot = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-04";
		expect(
			formatHerdrResourceLabel({
				semanticLabel: "review-api",
				...slotLabelInputFromWorktreeRoot(worktreeRoot),
			}),
		).toBe("s4:review-api");
		expect(slotLabelInputFromWorktreeRoot(`${worktreeRoot}/ts/packages`)).toEqual({});
		expect(
			slotLabelInputFromWorktreeRoot(
				"/Users/example/.local/state/ns/other/repos/ns/worktrees/slot-04",
			),
		).toEqual({});
		expect(
			slotLabelInputFromWorktreeRoot(
				"/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-4",
			),
		).toEqual({});
		expect(slotLabelInputFromWorktreeRoot("/repo")).toEqual({});
		expect(formatHerdrResourceLabel({ semanticLabel: "review-api" })).toBe("review-api");
	});
});

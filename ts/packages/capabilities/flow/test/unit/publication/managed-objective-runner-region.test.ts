import { describe, expect, test } from "vitest";

import { mergeObjectiveRunnerRegion } from "../../../src/publication/managed-objective-runner-region.ts";

const FLOW_REGION = [
	"<!-- ns-pr-description:begin version=2 patch-id=a prompt=b generator=c -->",
	"Flow content",
	"<!-- ns-pr-description:end -->",
].join("\n");

function region(slug: string, body: string): string {
	return [
		`<!-- ns-objective-runner:begin objective=${slug} -->`,
		body,
		"<!-- ns-objective-runner:end -->",
	].join("\n");
}

describe("mergeObjectiveRunnerRegion", () => {
	test("appends after existing prose and Flow's managed region without changing either", () => {
		const existingBody = `Human prose\n\n${FLOW_REGION}\n`;
		expect(
			mergeObjectiveRunnerRegion({
				existingBody,
				objectiveSlug: "demo-objective",
				managedBody: "## Objective Runner\n\nNew facts\n",
			}),
		).toEqual({
			type: "merged",
			body: `${existingBody}\n${region("demo-objective", "## Objective Runner\n\nNew facts")}`,
		});
	});

	test("replaces only the complete matching region idempotently", () => {
		const existingBody = `Before  \n${region("demo-objective", "Old")}\n  After`;
		const once = mergeObjectiveRunnerRegion({
			existingBody,
			objectiveSlug: "demo-objective",
			managedBody: "New",
		});
		expect(once).toEqual({
			type: "merged",
			body: `Before  \n${region("demo-objective", "New")}\n  After`,
		});
		if (once.type !== "merged") throw new Error("expected merged region");
		expect(
			mergeObjectiveRunnerRegion({
				existingBody: once.body,
				objectiveSlug: "demo-objective",
				managedBody: "New",
			}),
		).toEqual(once);
	});

	test("refuses invalid Objective slugs, malformed regions, and foreign-owned regions", () => {
		expect(
			mergeObjectiveRunnerRegion({
				existingBody: "Human prose",
				objectiveSlug: "demo -->\nInjected",
				managedBody: "New",
			}),
		).toMatchObject({ type: "refused", reason: "invalid-objective" });
		expect(
			mergeObjectiveRunnerRegion({
				existingBody: "<!-- ns-objective-runner:begin objective=demo-objective -->\nBody",
				objectiveSlug: "demo-objective",
				managedBody: "New",
			}),
		).toMatchObject({ type: "refused", reason: "malformed-region" });
		expect(
			mergeObjectiveRunnerRegion({
				existingBody: region("other-objective", "Body"),
				objectiveSlug: "demo-objective",
				managedBody: "New",
			}),
		).toMatchObject({ type: "refused", reason: "foreign-objective" });
	});
});

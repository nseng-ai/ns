import { describe, expect, test } from "vitest";

import {
	prepareDispatchPlan,
	type DispatchSavedPlanGateway,
	type DispatchSavedPlanResolution,
} from "../../src/dispatch-client/dispatch-plan/preparation.ts";

const PLAN_REF = "/state/ns/enriched-plan/ns/main/add-cache.md";
const PLAN_CONTENT = "# Add cache\n\nImplement the cache safely.\n";
const DISPATCH_ID = "dsp_01JABCDEF0123456789";

class FakeDispatchSavedPlanGateway implements DispatchSavedPlanGateway {
	readonly resolutions: Array<{ cwd: string; planRef: string }> = [];
	private readonly result: DispatchSavedPlanResolution;

	constructor(
		result: DispatchSavedPlanResolution = {
			type: "resolved",
			plan: {
				filePath: PLAN_REF,
				slug: "add-cache-safely",
				sourceBranch: "feature/cache",
				content: PLAN_CONTENT,
			},
		},
	) {
		this.result = result;
	}

	async resolveExplicitSavedPlan(options: { readonly cwd: string; readonly planRef: string }) {
		this.resolutions.push({ ...options });
		return this.result;
	}
}

describe("prepareDispatchPlan", () => {
	test("resolves one explicit Saved Plan without writing pre-anchor context", async () => {
		const savedPlans = new FakeDispatchSavedPlanGateway();
		const generatedIds: string[] = [];

		const outcome = await prepareDispatchPlan(
			{ cwd: "/repo", planRef: PLAN_REF },
			{
				savedPlans,
				generateDispatchId: () => {
					generatedIds.push(DISPATCH_ID);
					return DISPATCH_ID;
				},
			},
		);

		expect(savedPlans.resolutions).toEqual([{ cwd: "/repo", planRef: PLAN_REF }]);
		expect(generatedIds).toEqual([DISPATCH_ID]);
		expect(outcome).toEqual({
			status: "ready",
			dispatchId: DISPATCH_ID,
			plan: {
				filePath: PLAN_REF,
				slug: "add-cache-safely",
				sourceBranch: "feature/cache",
				content: PLAN_CONTENT,
			},
		});
		expect(outcome).not.toHaveProperty("entry");
	});

	test.each([
		["not-found", "Saved Plan does not exist."],
		["unsafe", "Saved Plan resolves outside the plan store."],
		["error", "Saved Plan could not be read."],
	] as const)(
		"preserves a %s resolution failure without creating a Dispatch ID",
		async (type, message) => {
			const savedPlans = new FakeDispatchSavedPlanGateway({ type, message });
			let generatedIdCount = 0;

			const outcome = await prepareDispatchPlan(
				{ cwd: "/repo", planRef: PLAN_REF },
				{
					savedPlans,
					generateDispatchId: () => {
						generatedIdCount += 1;
						return DISPATCH_ID;
					},
				},
			);

			expect(outcome).toEqual({ status: "plan-resolution-failed", reason: type, message });
			expect(generatedIdCount).toBe(0);
		},
	);
});

import { describe, expect, test } from "vitest";

import {
	DISPATCH_CONTEXT_NAMESPACE,
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
				slug: "add-cache",
				sourceBranch: "feature/cache",
				content: PLAN_CONTENT,
			},
		},
	) {
		this.result = result;
	}

	async resolveExplicitSavedPlan(options: {
		readonly cwd: string;
		readonly planRef: string;
	}): Promise<DispatchSavedPlanResolution> {
		this.resolutions.push({ ...options });
		return this.result;
	}
}

describe("prepareDispatchPlan", () => {
	test("resolves one explicit Saved Plan and derives its dispatch-owned Branch Memory identity", async () => {
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
				slug: "add-cache",
				sourceBranch: "feature/cache",
				content: PLAN_CONTENT,
			},
			entry: {
				namespace: DISPATCH_CONTEXT_NAMESPACE,
				key: `${DISPATCH_ID}/plan/add-cache.md`,
				sourceBranch: "feature/cache",
				snapshotRef: "refs/brmem/ns/dispatch-context/feature---cache",
				entryLocator: `refs/brmem/ns/dispatch-context/feature---cache:${DISPATCH_ID}/plan/add-cache.md`,
				content: PLAN_CONTENT,
			},
		});
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

			expect(outcome).toEqual({
				status: "plan-resolution-failed",
				reason: type,
				message,
			});
			expect(generatedIdCount).toBe(0);
		},
	);

	test("rejects a Dispatch ID that cannot form a Branch Memory Entry Key", async () => {
		const outcome = await prepareDispatchPlan(
			{ cwd: "/repo", planRef: PLAN_REF },
			{
				savedPlans: new FakeDispatchSavedPlanGateway(),
				generateDispatchId: () => "unsafe/id with spaces",
			},
		);

		expect(outcome).toEqual({
			status: "invalid-dispatch-context",
			dispatchId: "unsafe/id with spaces",
			message: 'Invalid dispatch plan Entry Key: key contains forbidden character " "',
		});
	});

	test("rejects a source branch that cannot form an exact Snapshot Ref", async () => {
		const savedPlans = new FakeDispatchSavedPlanGateway({
			type: "resolved",
			plan: {
				filePath: PLAN_REF,
				slug: "add-cache",
				sourceBranch: "feature---cache",
				content: PLAN_CONTENT,
			},
		});

		const outcome = await prepareDispatchPlan(
			{ cwd: "/repo", planRef: PLAN_REF },
			{ savedPlans, generateDispatchId: () => DISPATCH_ID },
		);

		expect(outcome).toEqual({
			status: "invalid-dispatch-context",
			dispatchId: DISPATCH_ID,
			message:
				"Invalid branch name \"feature---cache\": branch names containing '---' cannot be encoded into refs/brmem",
		});
	});
});

import { describe, expect, test } from "vitest";

import { BRANCH_CONTEXT_NAMESPACE } from "@asdl/branch-context";
import registerBranchContextExtension from "../src/branch-context-extension.ts";

import {
	FakePi,
	IMPL_BRANCH,
	IMPL_PLAN_CONTENT,
	IMPL_REF,
	PLAN_KEY,
	PLAN_SLUG,
	SOURCE_BRANCH,
	attachedPlan,
	createBranchContextOperationFakes,
	createContext,
} from "./branch-context-extension-support.ts";

describe("branch-context-impl", () => {
	test("branch-context:impl waits, loads the attached plan, and sends an implementation prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		const fakes = createBranchContextOperationFakes({
			loadBranchContextPlan: async () => attachedPlan({ refName: IMPL_REF }),
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:impl");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(pi.execCalls).toEqual([]);
		expect(fakes.loadPlanCalls).toHaveLength(1);
		expect(fakes.loadPlanCalls[0]?.[1]).toEqual({});
		expect(context.notifications).toEqual([
			{ message: "Loading attached branch-context plan…", level: "info" },
		]);
		expect(context.statuses).toEqual([
			{ key: "branch-context:impl", value: "loading attached plan…" },
			{ key: "branch-context:impl", value: undefined },
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.customType).toBe("branch-context-output");
		expect(pi.sentMessages[0]?.content).toContain("Loaded attached branch-context plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${IMPL_BRANCH}`);
		expect(pi.sentMessages[0]?.content).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(pi.sentMessages[0]?.content).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain(`Ref: ${IMPL_REF}`);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain(
			"The attached branch-context plan has been loaded by the planning-layer reader.",
		);
		expect(pi.sentUserMessages[0]).toContain(`Branch: ${IMPL_BRANCH}`);
		expect(pi.sentUserMessages[0]).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(pi.sentUserMessages[0]).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentUserMessages[0]).toContain(`Ref: ${IMPL_REF}`);
		expect(pi.sentUserMessages[0]).toContain(
			`Bytes: ${new TextEncoder().encode(IMPL_PLAN_CONTENT).length}`,
		);
		expect(pi.sentUserMessages[0]).toContain(IMPL_PLAN_CONTENT);
		expect(pi.sentUserMessages[0]).toContain("Create an implementation checklist");
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("branch-context:impl passes a requested slug into attached-plan selection", async () => {
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:impl");
		const context = createContext();

		await command?.handler(`  ${PLAN_SLUG}  `, context.ctx);

		pi.assertDone();
		expect(fakes.loadPlanCalls[0]?.[1]).toEqual({ requestedKey: PLAN_SLUG });
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("branch-context:impl presents saved-plan fallback evidence", async () => {
		const planContent = "# Saved Impl Plan\n\n- Implement from the saved plan.\n";
		const filePath = "/tmp/source-plan-store/branch-scoped-plan-extension.md";
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes({
			loadBranchContextPlan: async () =>
				attachedPlan({
					branch: SOURCE_BRANCH,
					namespace: "local-plan-store",
					refName: filePath,
					content: planContent,
					source: "saved",
					sourceFile: filePath,
				}),
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:impl");
		const context = createContext();

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(
			"Loaded saved branch-context plan from local plan store.",
		);
		expect(pi.sentMessages[0]?.content).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain(`Ref: ${filePath}`);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain(
			"The saved branch-context plan from the local plan store has been loaded",
		);
		expect(pi.sentUserMessages[0]).toContain(`Namespace: local-plan-store`);
		expect(pi.sentUserMessages[0]).toContain(`Ref: ${filePath}`);
		expect(pi.sentUserMessages[0]).toContain(
			`----- BEGIN SAVED PLAN -----\n${planContent}\n----- END SAVED PLAN -----`,
		);
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("branch-context:impl presents load failures without sending an implementation prompt", async () => {
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes({
			async loadBranchContextPlan() {
				throw new Error("Refusing to implement directly on trunk (`main`)");
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:impl");
		const context = createContext();

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.customType).toBe("branch-context-output");
		expect(pi.sentMessages[0]?.content).toContain("Failed to load branch-context plan.");
		expect(pi.sentMessages[0]?.content).toContain(
			"Refusing to implement directly on trunk (`main`)",
		);
		expect(pi.execCalls).toEqual([]);
		expect(context.statuses.at(-1)).toEqual({ key: "branch-context:impl", value: undefined });
	});
});

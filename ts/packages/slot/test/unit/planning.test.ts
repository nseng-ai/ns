import { describe, expect, it } from "vitest";

import { planCheckout, planCurrentCheckout, planCurrentWtRedirect, inventoryWithoutCallerBranchOccupancy } from "../../src/planning.ts";
import type { SlotInventory } from "../../src/inventory.ts";
import { FakeSlotGitGateway } from "../../src/gateways/fakes/git.ts";

const slot1 = { slotName: "slot-01", slotNumber: 1, path: "/slots/repos/repo/worktrees/slot-01", branch: null, operation: null };
const slot2 = { slotName: "slot-02", slotNumber: 2, path: "/slots/repos/repo/worktrees/slot-02", branch: null, operation: null };

function inventory(overrides: Partial<SlotInventory> = {}): SlotInventory {
	return {
		records: [slot1, slot2],
		mainWorktree: { path: "/repo", branch: "master" },
		branchOccupancies: [{ path: "/repo", branch: "master", operation: "checked-out" }],
		...overrides,
	};
}

describe("checkout planning", () => {
	it("reuses an existing clean slot assignment", async () => {
		const plan = await planCheckout(inventory({ records: [{ ...slot1, branch: "feature/a" }] }), new FakeSlotGitGateway(), "feature/a");
		expect(plan).toMatchObject({ type: "reuse_assignment", record: { slotName: "slot-01" } });
	});

	it("reports operation-held slots as branch in use", async () => {
		const plan = await planCheckout(inventory({ records: [{ ...slot1, branch: "feature/a", operation: "rebase" }] }), new FakeSlotGitGateway(), "feature/a");
		expect(plan).toMatchObject({ type: "branch_in_use", occupancy: { operation: "rebase" } });
	});

	it("returns the main worktree redirect plan when the branch is in main", async () => {
		const plan = await planCheckout(inventory(), new FakeSlotGitGateway(), "master");
		expect(plan).toEqual({ type: "branch_in_main_worktree", mainPath: "/repo" });
	});

	it("assigns the lowest clean detached slot", async () => {
		const plan = await planCheckout(inventory(), new FakeSlotGitGateway(), "feature/a");
		expect(plan).toMatchObject({ type: "assign_to_slot", record: { slotName: "slot-01" } });
	});

	it("reports pool full with assigned records", async () => {
		const plan = await planCheckout(inventory({ records: [{ ...slot1, branch: "a" }, { ...slot2, branch: "b" }] }), new FakeSlotGitGateway(), "feature/a");
		expect(plan).toMatchObject({ type: "pool_full", assigned: [{ slotName: "slot-01" }, { slotName: "slot-02" }] });
	});

	it("plans previous-branch redirect before trunk", async () => {
		const git = new FakeSlotGitGateway({ previousBranches: { "/repo": "prev" }, localBranches: ["master", "moving", "prev"], worktrees: [{ path: "/repo", branch: "moving" }] });
		await expect(planCurrentWtRedirect(git, { cwd: "/repo", movingBranch: "moving" })).resolves.toEqual({ action: { type: "checkout_branch", branch: "prev", role: "previous" }, note: null });
	});

	it("detaches a managed slot worktree at trunk", async () => {
		const git = new FakeSlotGitGateway({ trunkBranch: "main" });
		await expect(planCurrentWtRedirect(git, { cwd: "/slots/repos/repo/worktrees/slot-01", movingBranch: "feature/a" })).resolves.toEqual({ action: { type: "detach_head", ref: "main" }, note: null });
	});

	it("removes only the caller branch occupancy", () => {
		const adjusted = inventoryWithoutCallerBranchOccupancy(inventory({ records: [{ ...slot1, branch: "moving" }, { ...slot2, branch: "other" }], branchOccupancies: [{ path: slot1.path, branch: "moving", operation: "checked-out" }, { path: slot2.path, branch: "other", operation: "checked-out" }] }), { cwd: slot1.path, movingBranch: "moving" });
		expect(adjusted.records[0]).toMatchObject({ branch: null, operation: null });
		expect(adjusted.records[1]).toMatchObject({ branch: "other" });
		expect(adjusted.branchOccupancies).toHaveLength(1);
	});

	it("plans current checkout without redirect when current branch is already in a slot", async () => {
		const git = new FakeSlotGitGateway({ worktrees: [{ path: "/repo", branch: "master" }, { path: slot1.path, branch: "feature/a" }], localBranches: ["master", "feature/a"] });
		await expect(planCurrentCheckout(git, { cwd: slot1.path, mainRepoRoot: "/repo" })).resolves.toMatchObject({ type: "ok", plan: { type: "reuse_assignment" }, redirect: null });
	});
});

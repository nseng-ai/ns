import { describe, expect, it } from "vitest";

import { buildSlotInventory, findByBranch, findBySlot, lowestAvailable, poolSize, slotStatus } from "../../src/inventory.ts";
import { FakeSlotGitGateway } from "../../src/gateways/fakes/git.ts";

describe("slot inventory", () => {
	it("derives managed slots, skips main and non-slot worktrees, and sorts by number", async () => {
		const git = new FakeSlotGitGateway({
			worktrees: [
				{ path: "/repo", branch: "master" },
				{ path: "/other/not-a-slot", branch: "feature/nope" },
				{ path: "/slots/repos/repo/worktrees/slot-02", branch: null },
				{ path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a" },
			],
		});
		const inventory = await buildSlotInventory(git, { mainRepoRoot: "/repo" });
		expect(poolSize(inventory)).toBe(2);
		expect(inventory.mainWorktree).toEqual({ path: "/repo", branch: "master" });
		expect(inventory.records.map((record) => record.slotName)).toEqual(["slot-01", "slot-02"]);
		expect(slotStatus(inventory.records[0]!)).toBe("assigned");
		expect(slotStatus(inventory.records[1]!)).toBe("available");
		expect(slotStatus({ ...inventory.records[1]!, operation: "rebase" })).toBe("assigned");
	});

	it("uses non-checked-out occupancy as operation state", async () => {
		const git = new FakeSlotGitGateway({
			worktrees: [{ path: "/slots/repos/repo/worktrees/slot-03", branch: "feature/rebase" }],
			branchOccupancies: [{ path: "/slots/repos/repo/worktrees/slot-03", branch: "feature/rebase", operation: "rebase" }],
		});
		const inventory = await buildSlotInventory(git);
		expect(inventory.records[0]).toMatchObject({ branch: "feature/rebase", operation: "rebase" });
	});

	it("finds branch and slot matches", async () => {
		const git = new FakeSlotGitGateway({ worktrees: [{ path: "/repo", branch: "master" }, { path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a" }] });
		const inventory = await buildSlotInventory(git, { mainRepoRoot: "/repo" });
		expect(findByBranch(inventory, "feature/a")?.kind).toBe("slot");
		expect(findByBranch(inventory, "master")?.kind).toBe("main");
		expect(findBySlot(inventory, "slot-01")?.branch).toBe("feature/a");
	});

	it("lowest available skips assigned and dirty slots", async () => {
		const git = new FakeSlotGitGateway({
			worktrees: [
				{ path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a" },
				{ path: "/slots/repos/repo/worktrees/slot-02", branch: null },
				{ path: "/slots/repos/repo/worktrees/slot-03", branch: null },
			],
			dirtyPaths: ["/slots/repos/repo/worktrees/slot-02"],
		});
		const inventory = await buildSlotInventory(git);
		expect((await lowestAvailable(inventory, git))?.slotName).toBe("slot-03");
	});
});

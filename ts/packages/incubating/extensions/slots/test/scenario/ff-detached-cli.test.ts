import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const mainWorktree = { path: "/repo", branch: "master" };
const slot01 = "/slots/repos/repo/worktrees/slot-01";
const slot02 = "/slots/repos/repo/worktrees/slot-02";
const slot03 = "/slots/repos/repo/worktrees/slot-03";

describe("slot ff-detached CLI", () => {
	it("appears in root help with its attached-Slot safety boundary", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("ff-detached");
		expect(run.stdout.join("")).toContain("without modifying attached Slots");
	});

	it("describes its safety boundary in command help", async () => {
		const run = runScenario(["ff-detached", "--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toMatch(/without modifying attached\s+Slots/);
		expect(run.stdout.join("")).toContain("--dry-run");
		expect(run.stdout.join("")).toContain("--force");
	});

	it("publishes the real result envelope schema", async () => {
		const run = runScenario(["ff-detached", "--json-schema"]);
		expect(await run.exit).toBe(0);
		const schema = run.stdout.join("");
		expect(schema).toContain('"status"');
		expect(schema).toContain('"trunk"');
		expect(schema).toContain('"would-advance"');
		expect(schema).toContain('"operation-in-progress"');
	});

	it("returns an ok empty result when no managed Slots exist", async () => {
		const run = runScenario(["ff-detached", "--format", "json"], {
			git: { worktrees: [mainWorktree], trunkBranch: "main" },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { trunk: "main", totalCount: 0, slots: [] },
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("leaves attached Slots and the main worktree unchanged", async () => {
		const run = runScenario(["ff-detached", "--format", "json"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01", "feature/a")],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				attachedCount: 1,
				slots: [{ slotName: "slot-01", branch: "feature/a", action: "attached" }],
			},
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("reports a detached Slot already at trunk as a successful no-op", async () => {
		const run = runScenario(["ff-detached", "--format", "json"], {
			git: { worktrees: [mainWorktree, slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				alreadyCurrentCount: 1,
				slots: [{ slotName: "slot-01", action: "already-current" }],
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "inspect-detached-head-fast-forward", path: slot01, targetRef: "master" },
		]);
	});

	it("fast-forwards detached Slots in deterministic Slot order using configured trunk", async () => {
		const run = runScenario(["ff-detached", "--format", "json"], {
			git: {
				trunkBranch: "main",
				worktrees: [slotWorktree("slot-02"), mainWorktree, slotWorktree("slot-01")],
				detachedHeadFastForwardInspections: {
					[slot01]: { type: "can-fast-forward" },
					[slot02]: { type: "can-fast-forward" },
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				trunk: "main",
				advancedCount: 2,
				slots: [
					{ slotName: "slot-01", action: "advanced" },
					{ slotName: "slot-02", action: "advanced" },
				],
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "inspect-detached-head-fast-forward", path: slot01, targetRef: "main" },
			{ type: "inspect-detached-head-fast-forward", path: slot02, targetRef: "main" },
			{ type: "fast-forward-detached-head", path: slot01, targetRef: "main" },
			{ type: "fast-forward-detached-head", path: slot02, targetRef: "main" },
		]);
	});

	it("keeps planned dirty and divergent skips in a successful aggregate", async () => {
		const run = runScenario(["ff-detached", "--format", "json"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01"), slotWorktree("slot-02")],
				dirtyPaths: [slot01],
				detachedHeadFastForwardInspections: {
					[slot02]: { type: "non-fast-forward" },
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				notAdvancedCount: 2,
				slots: [
					{ slotName: "slot-01", action: "not-advanced", reason: "dirty" },
					{ slotName: "slot-02", action: "not-advanced", reason: "non-fast-forward" },
				],
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "inspect-detached-head-fast-forward", path: slot02, targetRef: "master" },
		]);
	});

	it("preflights every Slot and refuses all mutation when a Git operation is in progress", async () => {
		const run = runScenario(["ff-detached", "--format", "json"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01"), slotWorktree("slot-02")],
				branchOccupancies: [{ path: slot01, branch: "feature/rebasing", operation: "rebase" }],
				detachedHeadFastForwardInspections: { [slot02]: { type: "can-fast-forward" } },
			},
		});
		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "negative",
			message: expect.stringContaining("pass --force"),
			data: {
				force: false,
				slots: [
					{ slotName: "slot-01", reason: "operation-in-progress", message: "rebase" },
					{ slotName: "slot-02", action: "would-advance" },
				],
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "inspect-detached-head-fast-forward", path: slot02, targetRef: "master" },
		]);
	});

	it("force skips operation-in-progress Slots and advances the remaining safe Slots", async () => {
		const run = runScenario(["ff-detached", "--force", "--format", "json"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01"), slotWorktree("slot-02")],
				branchOccupancies: [{ path: slot01, branch: "feature/rebasing", operation: "rebase" }],
				detachedHeadFastForwardInspections: { [slot02]: { type: "can-fast-forward" } },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				force: true,
				advancedCount: 1,
				notAdvancedCount: 1,
				slots: [
					{ slotName: "slot-01", reason: "operation-in-progress" },
					{ slotName: "slot-02", action: "advanced" },
				],
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "inspect-detached-head-fast-forward", path: slot02, targetRef: "master" },
			{ type: "fast-forward-detached-head", path: slot02, targetRef: "master" },
		]);
	});

	it("fails when a Slot becomes attached after planning", async () => {
		const run = runScenario(["ff-detached", "--format", "json"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01")],
				detachedHeadFastForwardInspections: { [slot01]: { type: "can-fast-forward" } },
				fastForwardDetachedHeadResults: {
					[slot01]: { type: "attached", branch: "feature/raced" },
				},
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			data: {
				attachedCount: 0,
				advancedCount: 0,
				notAdvancedCount: 1,
				slots: [
					{
						slotName: "slot-01",
						branch: "feature/raced",
						action: "not-advanced",
						reason: "state-changed",
					},
				],
			},
		});
	});

	it("fails planning without mutation when Slot inspection fails", async () => {
		const run = runScenario(["ff-detached", "--format", "json"], {
			git: {
				worktrees: [
					mainWorktree,
					slotWorktree("slot-01"),
					slotWorktree("slot-02"),
					slotWorktree("slot-03"),
				],
				uncommittedChangesFailures: { [slot01]: { message: "status failed" } },
				detachedHeadFastForwardInspections: {
					[slot02]: { type: "can-fast-forward" },
					[slot03]: { type: "can-fast-forward" },
				},
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "ff-detached-failed",
			message: expect.stringContaining("planning failed"),
			data: {
				notAdvancedCount: 1,
				advancedCount: 0,
				wouldAdvanceCount: 2,
				slots: [
					{ slotName: "slot-01", reason: "git-failure", message: "status failed" },
					{ slotName: "slot-02", action: "would-advance" },
					{ slotName: "slot-03", action: "would-advance" },
				],
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "inspect-detached-head-fast-forward", path: slot02, targetRef: "master" },
			{ type: "inspect-detached-head-fast-forward", path: slot03, targetRef: "master" },
		]);
	});

	it("returns failure when a planned fast-forward fails during mutation", async () => {
		const run = runScenario(["ff-detached", "--format", "json"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01"), slotWorktree("slot-02")],
				detachedHeadFastForwardInspections: {
					[slot01]: { type: "can-fast-forward" },
					[slot02]: { type: "can-fast-forward" },
				},
				fastForwardDetachedHeadResults: {
					[slot01]: { type: "failure", failure: { message: "merge failed" } },
				},
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "ff-detached-failed",
			data: {
				advancedCount: 1,
				notAdvancedCount: 1,
				slots: [
					{ slotName: "slot-01", reason: "git-failure", message: "merge failed" },
					{ slotName: "slot-02", action: "advanced" },
				],
			},
		});
	});

	it("dry-run reports intended advancement without mutation and stays successful for refusals", async () => {
		const run = runScenario(["ff-detached", "--dry-run", "--format", "json"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01"), slotWorktree("slot-02")],
				detachedHeadFastForwardInspections: {
					[slot01]: { type: "can-fast-forward" },
					[slot02]: { type: "non-fast-forward" },
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				dryRun: true,
				wouldAdvanceCount: 1,
				notAdvancedCount: 1,
				slots: [
					{ slotName: "slot-01", action: "would-advance" },
					{ slotName: "slot-02", reason: "non-fast-forward" },
				],
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "inspect-detached-head-fast-forward", path: slot01, targetRef: "master" },
			{ type: "inspect-detached-head-fast-forward", path: slot02, targetRef: "master" },
		]);
	});
});

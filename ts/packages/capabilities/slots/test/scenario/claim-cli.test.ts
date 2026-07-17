import { describe, expect, it } from "vitest";

import {
	parseJsonOutput,
	repoContext,
	runScenario,
	slotWorktree,
} from "../support/run-scenario.ts";

const slot1Path = "/slots/repos/repo/worktrees/slot-01";
const slot2Path = "/slots/repos/repo/worktrees/slot-02";

describe("slot claim CLI", () => {
	it("snapshots provisioning before moving a branch from its source slot", async () => {
		const chronology: string[] = [];
		const run = runScenario(["claim", "feature/source", "--format", "json"], {
			cwd: slot1Path,
			repo: repoContext({ root: slot1Path }),
			git: {
				localBranches: ["master", "feature/source", "feature/current"],
				worktrees: [
					slotWorktree("slot-01", "feature/current"),
					slotWorktree("slot-02", "feature/source"),
				],
				chronology,
			},
			provisionFiles: {
				projectConfigByRoot: {
					[slot1Path]: '[slots]\nprovision = [".env.local"]\n',
				},
				files: { "/slots/repos/repo/provision/default/.env.local": "SECRET=1\n" },
				chronology,
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slotName: "slot-01",
				branchName: "feature/source",
				sourceSlotName: "slot-02",
				sourceWorktreePath: slot2Path,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: slot2Path, ref: "master" },
			{ type: "checkout-branch", path: slot1Path, branch: "feature/source" },
		]);
		expect(chronology).toEqual([
			`read-project-config:${slot1Path}`,
			`detach-head:${slot2Path}:master`,
			`checkout-branch:${slot1Path}:feature/source`,
		]);
		expect(run.provisionFiles.fileAt(`${slot1Path}/.env.local`)).toEqual({
			content: "SECRET=1\n",
		});
	});

	it("returns already current without mutation", async () => {
		const run = runScenario(["claim", "feature/current", "--format", "json"], {
			cwd: slot1Path,
			repo: repoContext({ root: slot1Path }),
			git: {
				localBranches: ["master", "feature/current"],
				worktrees: [slotWorktree("slot-01", "feature/current")],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { alreadyCurrent: true, slotName: "slot-01" },
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("from main moves current non-trunk branch into the lowest slot", async () => {
		const run = runScenario(["claim", "feature/main", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/main"],
				worktrees: [{ path: "/repo", branch: "feature/main" }, slotWorktree("slot-01")],
				previousBranches: { "/repo": "master" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slotName: "slot-01",
				branchName: "feature/main",
				mainWorktreePath: "/repo",
				mainCheckoutBranch: "master",
				mainRedirectAction: "checkout-branch",
				mainRedirectRef: "master",
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "checkout-branch", path: "/repo", branch: "master" },
			{ type: "checkout-branch", path: slot1Path, branch: "feature/main" },
		]);
	});

	it("from main claiming trunk checks trunk out in main and moves current branch into a slot", async () => {
		const run = runScenario(["claim", "master", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/main"],
				worktrees: [{ path: "/repo", branch: "feature/main" }, slotWorktree("slot-01")],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slotName: "slot-01",
				branchName: "feature/main",
				mainWorktreePath: "/repo",
				mainCheckoutBranch: "master",
				mainRedirectAction: "checkout-branch",
				mainRedirectRef: "master",
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "checkout-branch", path: "/repo", branch: "master" },
			{ type: "checkout-branch", path: slot1Path, branch: "feature/main" },
		]);
	});

	it("from main claiming current trunk detaches main and checks trunk out into the lowest slot", async () => {
		const run = runScenario(["claim", "master", "--format", "json"], {
			git: {
				localBranches: ["master"],
				worktrees: [
					{ path: "/repo", branch: "master" },
					slotWorktree("slot-01"),
					slotWorktree("slot-02"),
				],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slotName: "slot-01",
				branchName: "master",
				mainWorktreePath: "/repo",
				mainCheckoutBranch: null,
				mainRedirectAction: "detach-head",
				mainRedirectRef: "master",
				mainRedirectNote: null,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: "/repo", ref: "master" },
			{ type: "checkout-branch", path: slot1Path, branch: "master" },
		]);
	});

	it("from main claiming current trunk already assigned to a slot refreshes that slot", async () => {
		const run = runScenario(["claim", "master", "--format", "json"], {
			git: {
				localBranches: ["master"],
				worktrees: [
					{ path: "/repo", branch: "master" },
					slotWorktree("slot-01"),
					slotWorktree("slot-02", "master"),
				],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slotName: "slot-02",
				branchName: "master",
				alreadyCurrent: false,
				mainWorktreePath: "/repo",
				mainCheckoutBranch: null,
				mainRedirectAction: "detach-head",
				mainRedirectRef: "master",
				mainRedirectNote: null,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: "/repo", ref: "master" },
			{ type: "checkout-branch", path: slot2Path, branch: "master" },
		]);
	});

	it("from main claiming current trunk detaches instead of checking out a previous branch", async () => {
		const run = runScenario(["claim", "master", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/previous"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
				previousBranches: { "/repo": "feature/previous" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: "/repo", ref: "master" },
			{ type: "checkout-branch", path: slot1Path, branch: "master" },
		]);
	});

	it("reports main detach in human output", async () => {
		const run = runScenario(["claim", "master"], {
			git: {
				localBranches: ["master"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
			},
		});
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("\n")).toContain("detached main worktree at master");
	});

	it.each([
		{ currentBranch: "master", claimedBranch: "master" },
		{ currentBranch: "feature/main", claimedBranch: "master" },
	])(
		"from main refuses dirty current worktree before claiming $claimedBranch from $currentBranch",
		async ({ currentBranch, claimedBranch }) => {
			const run = runScenario(["claim", claimedBranch, "--format", "json"], {
				git: {
					localBranches: ["master", "feature/main"],
					worktrees: [{ path: "/repo", branch: currentBranch }, slotWorktree("slot-01")],
					dirtyPaths: ["/repo"],
				},
			});
			expect(await run.exit).toBe(2);
			expect(parseJsonOutput(run)).toMatchObject({ errorType: "dirty-current-worktree" });
			expect(run.git.operations()).toEqual([]);
		},
	);

	it("refuses dirty source slot before mutation", async () => {
		const run = runScenario(["claim", "feature/source", "--format", "json"], {
			cwd: slot1Path,
			repo: repoContext({ root: slot1Path }),
			git: {
				localBranches: ["master", "feature/source", "feature/current"],
				worktrees: [
					slotWorktree("slot-01", "feature/current"),
					slotWorktree("slot-02", "feature/source"),
				],
				dirtyPaths: [slot2Path],
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "dirty-source-slot" });
		expect(run.git.operations()).toEqual([]);
	});
});

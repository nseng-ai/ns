import type {
	GraphiteBranchTopology,
	GraphiteTopologyParseDiagnostics,
} from "@nseng-ai/extension-kit/graphite/metadata";
import { describe, expect, it } from "vitest";

import { fakeStackGraphInfo, fakeStackInfo } from "@nseng-ai/extension-kit/graphite/testing";
import {
	parseJsonOutput,
	runScenario,
	slotWorktree,
	type ScenarioRunOptions,
} from "../support/run-scenario.ts";

describe("slot gt exec stack-branches CLI", () => {
	it("is hidden but invocable and emits compact branch JSON in human mode", async () => {
		const run = runScenario(["gt", "exec", "stack-branches"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "master",
						current: "feature/current",
						ancestors: ["master", "feature/a"],
						descendants: ["feature/c"],
					}),
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe('{"branches":["feature/a","feature/current","feature/c"]}\n');
	});

	it("returns the full envelope in JSON mode", async () => {
		const run = runScenario(["gt", "exec", "stack-branches", "--downstack", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "master",
						current: "feature/current",
						ancestors: ["master", "feature/a"],
						descendants: ["feature/c"],
					}),
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				branches: ["feature/a", "feature/current"],
				scope: "downstack",
				edges: [
					{ parent: "master", child: "feature/a" },
					{ parent: "feature/a", child: "feature/current" },
				],
			},
		});
	});

	it("returns a negative result on trunk", async () => {
		const run = runScenario(["gt", "exec", "stack-branches", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }] },
			gt: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "master",
						current: "master",
						ancestors: [],
						descendants: [],
					}),
				},
			},
		});
		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			exitCode: 1,
			message: "On trunk 'master'; no stack is checked out.",
			data: { branches: [] },
		});
	});

	it("fails forked full-stack metadata but only warns for downstack scope", async () => {
		const stack = fakeStackInfo({
			trunk: "master",
			current: "feature/current",
			ancestors: ["master"],
			descendants: ["feature/a"],
			descendantWalk: {
				forks: [{ branch: "feature/current", children: ["feature/a", "feature/b"] }],
				childrenCorruptions: [],
				termination: { type: "completed" },
			},
		});
		const full = runScenario(["gt", "exec", "stack-branches", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { stack: { type: "stack", stack } },
		});
		expect(await full.exit).toBe(2);
		expect(parseJsonOutput(full)).toMatchObject({ errorType: "forked-stack" });
		const down = runScenario(["gt", "exec", "stack-branches", "--downstack"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { stack: { type: "stack", stack } },
		});
		expect(await down.exit).toBe(0);
		expect(down.stderr.join("")).toContain("branch feature/current has 2 Graphite children");
	});
});

describe("slot gt exec quiescence CLI", () => {
	it("is hidden but invocable and emits compact quiescence JSON in human mode", async () => {
		const run = runQuiescenceScenario(["gt", "exec", "quiescence"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe('{"isQuiescent":true,"blockers":[]}\n');
	});

	it("returns a negative non-quiescent result on trunk", async () => {
		const run = runQuiescenceScenario(["gt", "exec", "quiescence", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }] },
			gt: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "master",
						current: "master",
						ancestors: [],
						descendants: [],
					}),
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			exitCode: 1,
			message: "On trunk 'master'; no stack is checked out.",
			data: {
				isQuiescent: false,
				branches: [],
				blockers: [],
				snapshot: {
					scope: "downstack",
					trunk: "master",
					current: "master",
					branches: [],
				},
			},
		});
	});

	it("returns the JSON envelope with downstack branches and snapshot heads", async () => {
		const run = runQuiescenceScenario(["gt", "exec", "quiescence", "--format", "json"], {
			git: {
				localBranchTips: [
					{ name: "master", headIso: "master-head" },
					{ name: "feature/a", headIso: "a-head" },
					{ name: "feature/current", headIso: "current-head" },
					{ name: "feature/child", headIso: "child-head" },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				isQuiescent: true,
				scope: "downstack",
				branches: ["feature/a", "feature/current"],
				snapshot: {
					scope: "downstack",
					trunk: "master",
					current: "feature/current",
					branches: [
						{ branch: "feature/a", head: "a-head" },
						{ branch: "feature/current", head: "current-head" },
					],
				},
				blockers: [],
			},
		});
	});

	it("ignores descendant blockers by default but blocks them with full scope", async () => {
		const git = {
			worktrees: [
				{ path: "/repo", branch: "feature/current" },
				slotWorktree("slot-04", "feature/child"),
			],
		};
		const downstack = runQuiescenceScenario(["gt", "exec", "quiescence", "--format", "json"], {
			git,
		});
		expect(await downstack.exit).toBe(0);

		const full = runQuiescenceScenario(
			["gt", "exec", "quiescence", "--scope", "full", "--format", "json"],
			{ git },
		);
		expect(await full.exit).toBe(1);
		expect(parseJsonOutput(full)).toMatchObject({
			status: "negative",
			data: {
				blockers: [
					{
						type: "checked-out-elsewhere",
						branch: "feature/child",
						worktreePath: "/slots/repos/repo/worktrees/slot-04",
					},
				],
			},
		});
	});

	it("allows the current worktree checkout but blocks an in-scope branch checked out elsewhere", async () => {
		const run = runQuiescenceScenario(["gt", "exec", "quiescence", "--format", "json"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-03", "feature/a"),
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			message: "Stack is not quiescent.",
			data: {
				blockers: [
					{
						type: "checked-out-elsewhere",
						branch: "feature/a",
						worktreePath: "/slots/repos/repo/worktrees/slot-03",
					},
				],
			},
		});
	});

	it("blocks rebase state from occupancy and slot inventory evidence", async () => {
		const run = runQuiescenceScenario(["gt", "exec", "quiescence", "--format", "json"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-03", "feature/a"),
				],
				branchOccupancies: [
					{ path: "/repo", branch: "feature/current", operation: "checked-out" },
					{
						path: "/slots/repos/repo/worktrees/slot-03",
						branch: "feature/a",
						operation: "rebase",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(quiescenceJsonData(parseJsonOutput(run)).blockers).toEqual([
			{
				type: "slot-rebase-in-progress",
				branch: "feature/a",
				slotName: "slot-03",
				worktreePath: "/slots/repos/repo/worktrees/slot-03",
				operation: "rebase",
			},
		]);
	});

	it("emits snapshots and blocks on expected snapshot ref drift", async () => {
		const first = runQuiescenceScenario(["gt", "exec", "quiescence", "--format", "json"], {
			git: {
				localBranchTips: [
					{ name: "feature/a", headIso: "a-1" },
					{ name: "feature/current", headIso: "current-1" },
				],
			},
		});
		expect(await first.exit).toBe(0);
		const snapshot = quiescenceJsonData(parseJsonOutput(first)).snapshot;

		const matching = runQuiescenceScenario(
			[
				"gt",
				"exec",
				"quiescence",
				"--expect-snapshot-json",
				JSON.stringify(snapshot),
				"--format",
				"json",
			],
			{
				git: {
					localBranchTips: [
						{ name: "feature/a", headIso: "a-1" },
						{ name: "feature/current", headIso: "current-1" },
					],
				},
			},
		);
		expect(await matching.exit).toBe(0);

		const drift = runQuiescenceScenario(
			[
				"gt",
				"exec",
				"quiescence",
				"--expect-snapshot-json",
				JSON.stringify(snapshot),
				"--format",
				"json",
			],
			{
				git: {
					localBranchTips: [
						{ name: "feature/a", headIso: "a-2" },
						{ name: "feature/current", headIso: "current-1" },
					],
				},
			},
		);
		expect(await drift.exit).toBe(1);
		expect(parseJsonOutput(drift)).toMatchObject({
			data: {
				blockers: [
					{
						type: "ref-drift",
						branch: "feature/a",
						expectedHead: "a-1",
						actualHead: "a-2",
					},
				],
			},
		});
	});

	it("rejects invalid expected snapshot JSON", async () => {
		const run = runQuiescenceScenario([
			"gt",
			"exec",
			"quiescence",
			"--expect-snapshot-json",
			"{",
			"--format",
			"json",
		]);

		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			errorType: "usageError",
			data: { argument: "--expect-snapshot-json" },
		});
	});

	it("propagates existing stack failure paths", async () => {
		const untracked = runQuiescenceScenario(["gt", "exec", "quiescence", "--format", "json"], {
			gt: {
				stack: {
					type: "untracked_branch",
					message: "current branch is not tracked by Graphite: feature/current",
				},
			},
		});
		expect(await untracked.exit).toBe(2);
		expect(parseJsonOutput(untracked)).toMatchObject({ errorType: "untracked-branch" });
	});
});

describe("slot gt exec restack-preflight CLI", () => {
	it("is hidden, registered, and publishes its machine schema", async () => {
		const help = runScenario(["gt", "-h"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).not.toContain("restack-preflight");

		const schema = runScenario(["gt", "exec", "restack-preflight", "--json-schema"]);
		expect(await schema.exit).toBe(0);
		expect(schema.stdout.join("")).toContain("requestedScope");
		expect(schema.stdout.join("")).toContain("slotConflicts");
	});

	it("defaults to a ready downstack preflight and has a compact renderer", async () => {
		const run = runRestackPreflightScenario(["gt", "exec", "restack-preflight"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			'{"clean":true,"tracked":true,"rebaseInProgress":false,"effectiveScope":"downstack","slotConflicts":[]}\n',
		);

		const json = runRestackPreflightScenario([
			"gt",
			"exec",
			"restack-preflight",
			"--format",
			"json",
		]);
		expect(await json.exit).toBe(0);
		expect(parseJsonOutput(json)).toMatchObject({
			status: "ok",
			data: {
				clean: true,
				tracked: true,
				rebaseInProgress: false,
				hasUpstackChildren: true,
				requestedScope: "downstack",
				effectiveScope: "downstack",
				branches: ["feature/a", "feature/current"],
				slotConflicts: [],
				warnings: [],
			},
		});
	});

	it("uses the canonical worktree root from a nested cwd", async () => {
		const run = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{
				cwd: "/repo/subdirectory",
				git: {
					branchOccupancies: [
						{ path: "/repo", branch: "feature/current", operation: "checked-out" },
					],
				},
			},
		);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { rebaseInProgress: false, slotConflicts: [] },
		});
		expect(run.gt.operations()).toEqual([
			{ type: "stack-for-branch", cwd: "/repo", branch: "feature/current" },
		]);
	});

	it("uses full scope only when requested and upstack children exist", async () => {
		const full = runRestackPreflightScenario([
			"gt",
			"exec",
			"restack-preflight",
			"--scope",
			"full",
			"--format",
			"json",
		]);
		expect(await full.exit).toBe(0);
		expect(parseJsonOutput(full)).toMatchObject({
			data: {
				requestedScope: "full",
				effectiveScope: "full",
				branches: ["feature/a", "feature/current", "feature/child"],
			},
		});

		const noChildren = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--scope", "full", "--format", "json"],
			{
				stack: fakeStackInfo({
					trunk: "master",
					current: "feature/current",
					ancestors: ["master", "feature/a"],
					descendants: [],
				}),
			},
		);
		expect(await noChildren.exit).toBe(0);
		expect(parseJsonOutput(noChildren)).toMatchObject({
			data: { requestedScope: "full", effectiveScope: "downstack" },
		});
	});

	it("reports dirty and Slot occupancy blocks as negative, and a current-worktree rebase as ok", async () => {
		const dirty = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{ git: { dirtyPaths: ["/repo"] } },
		);
		expect(await dirty.exit).toBe(1);
		expect(parseJsonOutput(dirty)).toMatchObject({
			status: "negative",
			data: { clean: false },
		});

		const rebase = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{
				git: {
					branchOccupancies: [{ path: "/repo", branch: "feature/current", operation: "rebase" }],
				},
			},
		);
		expect(await rebase.exit).toBe(0);
		expect(parseJsonOutput(rebase)).toMatchObject({
			status: "ok",
			data: {
				rebaseInProgress: true,
				slotConflicts: [
					{
						type: "rebase-in-progress",
						branch: "feature/current",
						worktreePath: "/repo",
						operation: "rebase",
					},
				],
			},
		});

		const dirtyRebase = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{
				git: {
					dirtyPaths: ["/repo"],
					branchOccupancies: [{ path: "/repo", branch: "feature/current", operation: "rebase" }],
				},
			},
		);
		expect(await dirtyRebase.exit).toBe(0);
		expect(parseJsonOutput(dirtyRebase)).toMatchObject({
			status: "ok",
			data: { clean: false, rebaseInProgress: true },
		});

		const occupied = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{
				git: {
					worktrees: [
						{ path: "/repo", branch: "feature/current" },
						slotWorktree("slot-03", "feature/a"),
					],
				},
			},
		);
		expect(await occupied.exit).toBe(1);
		expect(parseJsonOutput(occupied)).toMatchObject({
			data: {
				slotConflicts: [
					{
						type: "checked-out-elsewhere",
						branch: "feature/a",
						worktreePath: "/slots/repos/repo/worktrees/slot-03",
					},
				],
			},
		});

		const slotRebase = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{
				git: {
					worktrees: [
						{ path: "/repo", branch: "feature/current" },
						slotWorktree("slot-03", "feature/a"),
					],
					branchOccupancies: [
						{ path: "/repo", branch: "feature/current", operation: "checked-out" },
						{
							path: "/slots/repos/repo/worktrees/slot-03",
							branch: "feature/a",
							operation: "rebase",
						},
					],
				},
			},
		);
		expect(await slotRebase.exit).toBe(1);
		expect(restackPreflightJsonData(parseJsonOutput(slotRebase)).slotConflicts).toEqual([
			{
				type: "slot-rebase-in-progress",
				branch: "feature/a",
				slotName: "slot-03",
				worktreePath: "/slots/repos/repo/worktrees/slot-03",
				operation: "rebase",
			},
		]);
	});

	it("returns untracked as a negative result with documented topology defaults", async () => {
		const run = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--scope", "full", "--format", "json"],
			{
				gt: {
					stack: {
						type: "untracked_branch",
						message: "current branch is not tracked by Graphite: feature/current",
					},
				},
			},
		);

		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "negative",
			data: {
				tracked: false,
				hasUpstackChildren: false,
				requestedScope: "full",
				effectiveScope: "downstack",
				branches: ["feature/current"],
				warnings: [],
			},
		});
	});

	it("returns trunk without claiming readiness", async () => {
		const trunk = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--scope", "full", "--format", "json"],
			{
				stack: fakeStackInfo({
					trunk: "master",
					current: "master",
					ancestors: [],
					descendants: [],
				}),
			},
		);
		expect(await trunk.exit).toBe(1);
		expect(parseJsonOutput(trunk)).toMatchObject({
			status: "negative",
			message: "On trunk 'master'; no stack is checked out.",
			data: { effectiveScope: "downstack", branches: [] },
		});
	});

	it("rejects an ordinary detached checkout", async () => {
		const detached = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{ git: { worktrees: [{ path: "/repo", branch: null }] } },
		);

		expect(await detached.exit).toBe(2);
		expect(parseJsonOutput(detached)).toMatchObject({
			status: "failure",
			errorType: "detached-head",
		});
	});

	it("returns usable ok data for a detached rebase with a recovered branch", async () => {
		const run = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--scope", "full", "--format", "json"],
			{
				cwd: "/repo/subdirectory",
				git: {
					worktrees: [{ path: "/repo", branch: null }],
					branchOccupancies: [{ path: "/repo", branch: "feature/current", operation: "rebase" }],
				},
			},
		);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				tracked: true,
				rebaseInProgress: true,
				requestedScope: "full",
				effectiveScope: "full",
				branches: ["feature/a", "feature/current", "feature/child"],
				slotConflicts: [
					{
						type: "rebase-in-progress",
						branch: "feature/current",
						worktreePath: "/repo",
						operation: "rebase",
					},
				],
			},
		});
		expect(run.gt.operations()).toEqual([
			{ type: "stack-for-branch", cwd: "/repo", branch: "feature/current" },
		]);
	});

	it("keeps recovered untracked rebases usable without guessing a missing branch", async () => {
		const untracked = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--scope", "full", "--format", "json"],
			{
				cwd: "/repo/subdirectory",
				git: {
					worktrees: [{ path: "/repo", branch: null }],
					branchOccupancies: [{ path: "/repo", branch: "feature/current", operation: "rebase" }],
				},
				gt: {
					stackForBranch: {
						type: "untracked_branch",
						message: "current branch is not tracked by Graphite: feature/current",
					},
				},
			},
		);

		expect(await untracked.exit).toBe(0);
		expect(parseJsonOutput(untracked)).toMatchObject({
			status: "ok",
			data: {
				tracked: false,
				rebaseInProgress: true,
				branches: ["feature/current"],
				slotConflicts: [
					{
						type: "rebase-in-progress",
						branch: "feature/current",
						worktreePath: "/repo",
						operation: "rebase",
					},
				],
			},
		});

		const missingBranch = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{
				git: {
					worktrees: [{ path: "/repo", branch: null }],
					branchOccupancies: [{ path: "/repo", branch: null, operation: "rebase" }],
				},
			},
		);

		expect(await missingBranch.exit).toBe(2);
		expect(parseJsonOutput(missingBranch)).toMatchObject({
			status: "failure",
			errorType: "detached-head",
		});
	});

	it("returns backend inspection failures as failures", async () => {
		const gitFailure = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{ git: { uncommittedChangesFailure: { message: "status unavailable" } } },
		);
		expect(await gitFailure.exit).toBe(2);
		expect(parseJsonOutput(gitFailure)).toMatchObject({
			status: "failure",
			errorType: "git-inspection-failed",
			message: "status unavailable",
			data: { operation: "inspect-worktree-and-slot-inventory" },
		});

		const graphiteFailure = runRestackPreflightScenario(
			["gt", "exec", "restack-preflight", "--format", "json"],
			{
				gt: {
					stack: {
						type: "failure",
						failure: { message: "metadata unavailable", returnCode: null },
					},
				},
			},
		);
		expect(await graphiteFailure.exit).toBe(2);
		expect(parseJsonOutput(graphiteFailure)).toMatchObject({
			status: "failure",
			errorType: "gt-stack-read-failed",
		});
	});
});

describe("slot gt exec stack-map-branches CLI", () => {
	it("shows help for the hidden stack-map operation", async () => {
		const run = runScenario(["gt", "exec", "stack-map-branches", "-h"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("--recent-limit");
	});

	it("emits graph rows, slot rows, recent limit, validation results, and compact human branch JSON", async () => {
		const run = runStackMapScenario(["gt", "exec", "stack-map-branches"], {
			rows: defaultStackMapRows(),
			git: { localBranchTips: [{ name: "feature/recent", headIso: "2026-01-02T00:00:00+00:00" }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			'{"branches":["master","feature/current","feature/child","feature/slot","feature/restack","feature/recent"]}\n',
		);
		expect(run.stderr.join("")).toBe("");
	});

	it("returns the full stack-map envelope in JSON mode", async () => {
		const run = runStackMapScenario(["gt", "exec", "stack-map-branches", "--format", "json"], {
			rows: defaultStackMapRows(),
			git: { localBranchTips: [{ name: "feature/recent", headIso: "2026-01-02T00:00:00+00:00" }] },
		});

		expect(await run.exit).toBe(0);
		const output = parseJsonOutput(run);
		expect(output).toMatchObject({
			data: {
				current: "feature/current",
				trunk: "master",
				scope: "stack-map",
				recentLimit: 40,
				edges: [
					{ parent: "feature/current", child: "feature/child" },
					{ parent: "master", child: "feature/current" },
					{ parent: "master", child: "feature/recent" },
					{ parent: "feature/slot", child: "feature/restack" },
					{ parent: "master", child: "feature/slot" },
				],
				slots: [
					{
						slotName: "slot-04",
						branch: "feature/slot",
						worktreePath: "/slots/repos/repo/worktrees/slot-04",
						status: "assigned",
					},
				],
				warnings: [],
			},
		});
		const data = jsonData(output);
		expect(data.branches.map((branch) => branch.name)).toEqual([
			"master",
			"feature/current",
			"feature/child",
			"feature/slot",
			"feature/restack",
			"feature/recent",
		]);
		expect(data.branches.find((branch) => branch.name === "feature/restack")).toMatchObject({
			validationResult: "BAD_PARENT_NAME",
			needsRestack: true,
		});
		expect(run.gt.operations()).toEqual([
			{ type: "stack", cwd: "/repo" },
			{ type: "stack-graph", cwd: "/repo" },
		]);
	});

	it("honors recent limit and recent timestamp ordering without selecting untracked names", async () => {
		const run = runStackMapScenario(
			["gt", "exec", "stack-map-branches", "--recent-limit", "1", "--format", "json"],
			{
				rows: [
					row("master", undefined, ["feature/current"], "TRUNK"),
					row("feature/current", "master"),
					row("feature/newer", "master"),
					row("feature/older", "master"),
					row("feature/unmentioned", "master"),
				],
				git: {
					worktrees: [{ path: "/repo", branch: "feature/current" }],
					localBranchTips: [
						{ name: "feature/older", headIso: "2026-01-01T00:00:00+00:00" },
						{ name: "feature/untracked", headIso: "2025-12-31T00:00:00+00:00" },
						{ name: "feature/newer", headIso: "2026-01-02T00:00:00+00:00" },
					],
				},
			},
		);

		expect(await run.exit).toBe(0);
		const branches = jsonData(parseJsonOutput(run)).branches.map((branch) => branch.name);
		expect(branches).toContain("feature/newer");
		expect(branches).not.toContain("feature/older");
		expect(branches).not.toContain("feature/untracked");
		expect(branches).not.toContain("feature/unmentioned");
	});

	it("supports zero recent limit and rejects negative recent limit", async () => {
		const zero = runStackMapScenario(
			["gt", "exec", "stack-map-branches", "--recent-limit", "0", "--format", "json"],
			{
				rows: [
					row("master", undefined, ["feature/current"], "TRUNK"),
					row("feature/current", "master"),
					row("feature/recent", "master"),
				],
				git: {
					worktrees: [{ path: "/repo", branch: "feature/current" }],
					localBranchTips: [{ name: "feature/recent", headIso: "2026-01-02T00:00:00+00:00" }],
				},
			},
		);
		expect(await zero.exit).toBe(0);
		expect(jsonData(parseJsonOutput(zero)).branches.map((branch) => branch.name)).not.toContain(
			"feature/recent",
		);

		const negative = runStackMapScenario([
			"gt",
			"exec",
			"stack-map-branches",
			"--recent-limit",
			"-1",
			"--format",
			"json",
		]);
		expect(await negative.exit).toBe(2);
	});

	it("filters stale metadata branches to local branches", async () => {
		const run = runStackMapScenario(["gt", "exec", "stack-map-branches", "--format", "json"], {
			rows: [
				row("master", undefined, ["feature/current", "stale-1"], "TRUNK"),
				row("feature/current", "master"),
				row("stale-1", "master", ["stale-2"]),
				row("stale-2", "stale-1"),
			],
			git: {
				worktrees: [{ path: "/repo", branch: "feature/current" }],
				localBranches: ["master", "feature/current"],
			},
		});

		expect(await run.exit).toBe(0);
		expect(jsonData(parseJsonOutput(run)).branches.map((branch) => branch.name)).toEqual([
			"master",
			"feature/current",
		]);
	});

	it("warns on forked graph while including both visible fork children", async () => {
		const run = runStackMapScenario(["gt", "exec", "stack-map-branches", "--format", "json"], {
			rows: [
				row("master", undefined, ["feature/current"], "TRUNK"),
				row("feature/current", "master", ["feature/a", "feature/b"]),
				row("feature/a", "feature/current"),
				row("feature/b", "feature/current"),
			],
			stack: fakeStackInfo({
				trunk: "master",
				current: "feature/current",
				ancestors: ["master"],
				descendants: ["feature/a"],
				descendantWalk: {
					forks: [{ branch: "feature/current", children: ["feature/a", "feature/b"] }],
					childrenCorruptions: [],
					termination: { type: "completed" },
				},
			}),
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
		});

		expect(await run.exit).toBe(0);
		const data = jsonData(parseJsonOutput(run));
		expect(data.warnings).toContain(
			"branch feature/current has 2 Graphite children; descendants follow the first child only",
		);
		expect(data.branches.map((branch) => branch.name)).toEqual([
			"master",
			"feature/current",
			"feature/a",
			"feature/b",
		]);
	});

	it("dedupes graph and stack warnings in first-seen order", async () => {
		const diagnostics: GraphiteTopologyParseDiagnostics = {
			emptyBranchNameRows: 1,
			childrenCorruptions: [{ branch: "feature/current", kind: "invalid_json" }],
		};
		const run = runStackMapScenario(["gt", "exec", "stack-map-branches", "--format", "json"], {
			rows: [
				row("master", undefined, ["feature/current"], "TRUNK"),
				row("feature/current", "master"),
			],
			diagnostics,
			stack: fakeStackInfo({
				trunk: "master",
				current: "feature/current",
				ancestors: ["master"],
				descendantWalk: {
					forks: [],
					childrenCorruptions: [{ branch: "feature/current", kind: "invalid_json" }],
					termination: { type: "completed" },
				},
			}),
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
		});

		expect(await run.exit).toBe(0);
		expect(jsonData(parseJsonOutput(run)).warnings).toEqual([
			"Graphite metadata row has an empty branchName; row ignored",
			"children metadata for feature/current is not valid JSON; treating as no children",
		]);
	});

	it("maps stack-map failure paths to stable error types", async () => {
		const cases = [
			{
				name: "not in repo",
				options: {
					repo: {
						type: "no_repo" as const,
						errorType: "not-in-repo" as const,
						message: "not in repo",
					},
				},
				errorType: "not-in-repo",
			},
			{
				name: "current branch failure",
				options: {
					git: { currentBranchFailures: { "/repo": { message: "symbolic ref failed" } } },
				},
				errorType: "git-current-branch-failed",
			},
			{
				name: "detached head",
				options: { git: { worktrees: [{ path: "/repo", branch: null }] } },
				errorType: "detached-head",
			},
			{
				name: "untracked Graphite branch",
				options: {
					gt: {
						stack: {
							type: "untracked_branch" as const,
							message: "current branch is not tracked by Graphite: feature/current",
						},
					},
				},
				errorType: "untracked-branch",
			},
			{
				name: "gt stack failure",
				options: {
					gt: {
						stack: {
							type: "failure" as const,
							failure: { message: "metadata unavailable", returnCode: 1 },
						},
					},
				},
				errorType: "gt-stack-read-failed",
			},
			{
				name: "git common dir missing",
				options: {
					gt: {
						stackGraph: {
							type: "git_common_dir_missing" as const,
							message: "Could not resolve Git common dir for Graphite metadata.",
						},
					},
				},
				errorType: "git-common-dir-missing",
			},
			{
				name: "metadata read failure",
				options: {
					gt: {
						stackGraph: {
							type: "failure" as const,
							failure: { message: "schema mismatch", returnCode: null },
						},
					},
				},
				errorType: "gt-metadata-read-failed",
			},
			{
				name: "missing trunk row",
				options: {
					gt: {
						stackGraph: {
							type: "graph" as const,
							graph: fakeStackGraphInfo({
								topology: new Map([["feature/current", row("feature/current", "master")]]),
							}),
						},
					},
				},
				errorType: "stack-metadata-inconsistent",
			},
		];

		for (const testCase of cases) {
			const run = runStackMapScenario(
				["gt", "exec", "stack-map-branches", "--format", "json"],
				testCase.options,
			);
			expect(await run.exit, testCase.name).toBe(2);
			expect(parseJsonOutput(run), testCase.name).toMatchObject({ errorType: testCase.errorType });
		}
	});
});

describe("slot gt exec backup-refs CLI", () => {
	// SCENARIO_NOW_MS (2026-07-12T12:00:00Z) renders as this compact UTC stamp.
	const stamp = "20260712120000";

	it("shows help for the hidden backup-refs operation", async () => {
		const run = runScenario(["gt", "exec", "backup-refs", "-h"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("--label");
		expect(run.stdout.join("")).toContain("--branch");
	});

	it("is hidden but invocable and emits compact backup JSON in human mode", async () => {
		const run = runScenario(
			["gt", "exec", "backup-refs", "--label", "smush", "--branch", "feature/current"],
			{ git: { localBranches: ["master", "feature/current"] } },
		);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			`{"prefix":"backup/smush-${stamp}/","refs":[{"branch":"feature/current","backupBranch":"backup/smush-${stamp}/feature__current"}]}\n`,
		);
	});

	it("creates one non-force backup branch per branch and returns the JSON envelope", async () => {
		const run = runScenario(
			[
				"gt",
				"exec",
				"backup-refs",
				"--label",
				"linearize",
				"--branch",
				"feature/a",
				"--branch",
				"tip",
				"--format",
				"json",
			],
			{ git: { localBranches: ["master", "feature/a", "tip"] } },
		);
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				prefix: `backup/linearize-${stamp}/`,
				label: "linearize",
				stamp,
				refs: [
					{ branch: "feature/a", backupBranch: `backup/linearize-${stamp}/feature__a` },
					{ branch: "tip", backupBranch: `backup/linearize-${stamp}/tip` },
				],
			},
		});
		expect(run.git.operations()).toEqual([
			{
				type: "create-branch",
				branch: `backup/linearize-${stamp}/feature__a`,
				startPoint: "feature/a",
				shouldForce: false,
			},
			{
				type: "create-branch",
				branch: `backup/linearize-${stamp}/tip`,
				startPoint: "tip",
				shouldForce: false,
			},
		]);
	});

	it("rejects a missing branch list and an invalid label as usage errors", async () => {
		const noBranches = runScenario(
			["gt", "exec", "backup-refs", "--label", "smush", "--format", "json"],
			{ git: { localBranches: ["master"] } },
		);
		expect(await noBranches.exit).toBe(2);
		expect(parseJsonOutput(noBranches)).toMatchObject({
			status: "usageError",
			data: { argument: "--branch" },
		});

		const badLabel = runScenario(
			[
				"gt",
				"exec",
				"backup-refs",
				"--label",
				"Bad_Label",
				"--branch",
				"master",
				"--format",
				"json",
			],
			{ git: { localBranches: ["master"] } },
		);
		expect(await badLabel.exit).toBe(2);
		expect(parseJsonOutput(badLabel)).toMatchObject({
			status: "usageError",
			data: { argument: "--label" },
		});
	});

	it("fails with branch-not-found before creating anything", async () => {
		const run = runScenario(
			[
				"gt",
				"exec",
				"backup-refs",
				"--label",
				"smush",
				"--branch",
				"feature/a",
				"--branch",
				"missing",
				"--format",
				"json",
			],
			{ git: { localBranches: ["master", "feature/a"] } },
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			errorType: "branch-not-found",
			data: { missing: ["missing"] },
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("fails with backup-ref-exists on a name collision before creating anything", async () => {
		const run = runScenario(
			[
				"gt",
				"exec",
				"backup-refs",
				"--label",
				"smush",
				"--branch",
				"feature/a",
				"--format",
				"json",
			],
			{
				git: {
					localBranches: ["master", "feature/a", `backup/smush-${stamp}/feature__a`],
				},
			},
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			errorType: "backup-ref-exists",
			data: { existing: [`backup/smush-${stamp}/feature__a`] },
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("reports a create failure with the branches already backed up", async () => {
		const run = runScenario(
			[
				"gt",
				"exec",
				"backup-refs",
				"--label",
				"smush",
				"--branch",
				"feature/a",
				"--branch",
				"tip",
				"--format",
				"json",
			],
			{
				git: {
					localBranches: ["master", "feature/a", "tip"],
					createBranchFailures: {
						[`backup/smush-${stamp}/tip`]: { message: "ref lock held" },
					},
				},
			},
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			errorType: "backup-create-failed",
			data: {
				branch: "tip",
				backupBranch: `backup/smush-${stamp}/tip`,
				created: [{ branch: "feature/a", backupBranch: `backup/smush-${stamp}/feature__a` }],
			},
		});
	});

	it("dedupes repeated branch flags", async () => {
		const run = runScenario(
			[
				"gt",
				"exec",
				"backup-refs",
				"--label",
				"smush",
				"--branch",
				"tip",
				"--branch",
				"tip",
				"--format",
				"json",
			],
			{ git: { localBranches: ["master", "tip"] } },
		);
		expect(await run.exit).toBe(0);
		expect(run.git.operations()).toHaveLength(1);
	});
});

interface QuiescenceScenarioOptions {
	readonly stack?: ReturnType<typeof fakeStackInfo>;
	readonly git?: ScenarioRunOptions["git"];
	readonly gt?: ScenarioRunOptions["gt"];
}

function runQuiescenceScenario(args: readonly string[], options: QuiescenceScenarioOptions = {}) {
	return runScenario(args, {
		git: {
			worktrees: [{ path: "/repo", branch: "feature/current" }],
			...options.git,
		},
		gt: {
			stack: {
				type: "stack",
				stack:
					options.stack ??
					fakeStackInfo({
						trunk: "master",
						current: "feature/current",
						ancestors: ["master", "feature/a"],
						descendants: ["feature/child"],
					}),
			},
			...options.gt,
		},
	});
}

interface QuiescenceJsonData {
	readonly snapshot: {
		readonly scope: "downstack" | "full";
		readonly trunk: string;
		readonly current: string;
		readonly branches: readonly { readonly branch: string; readonly head: string | null }[];
	};
	readonly blockers: readonly { readonly type: string }[];
}

function quiescenceJsonData(output: unknown): QuiescenceJsonData {
	expect(output).toMatchObject({ data: expect.any(Object) });
	return (output as { data: QuiescenceJsonData }).data;
}

interface RestackPreflightJsonData {
	readonly slotConflicts: readonly { readonly type: string }[];
}

function restackPreflightJsonData(output: unknown): RestackPreflightJsonData {
	expect(output).toMatchObject({ data: expect.any(Object) });
	return (output as { data: RestackPreflightJsonData }).data;
}

interface RestackPreflightScenarioOptions {
	readonly stack?: ReturnType<typeof fakeStackInfo>;
	readonly git?: ScenarioRunOptions["git"];
	readonly gt?: ScenarioRunOptions["gt"];
	readonly cwd?: string;
}

function runRestackPreflightScenario(
	args: readonly string[],
	options: RestackPreflightScenarioOptions = {},
) {
	return runScenario(args, {
		...(options.cwd === undefined ? {} : { cwd: options.cwd }),
		git: {
			worktrees: [{ path: "/repo", branch: "feature/current" }],
			...options.git,
		},
		gt: {
			stack: {
				type: "stack",
				stack:
					options.stack ??
					fakeStackInfo({
						trunk: "master",
						current: "feature/current",
						ancestors: ["master", "feature/a"],
						descendants: ["feature/child"],
					}),
			},
			...options.gt,
		},
	});
}

describe("slot gt exec descendants-report CLI", () => {
	it("is hidden, publishes JSON schema, and returns a valid leaf as a complete empty report", async () => {
		const help = runScenario(["gt", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).not.toContain("descendants-report");

		const schema = runDescendantsScenario(
			["gt", "exec", "descendants-report", "leaf", "--json-schema"],
			[row("leaf", "master")],
		);
		expect(await schema.exit).toBe(0);
		expect(schema.stdout.join("")).toContain("descendantCount");
		expect(schema.stdout.join("")).toContain("baseRefName");

		const leaf = runDescendantsScenario(
			["gt", "exec", "descendants-report", "leaf", "--format", "json"],
			[row("leaf", "master")],
		);
		expect(await leaf.exit).toBe(0);
		expect(parseJsonOutput(leaf)).toMatchObject({
			status: "ok",
			data: {
				root: "leaf",
				scope: "descendants",
				complete: true,
				descendantCount: 0,
				edges: [],
				descendants: [],
				warnings: [],
			},
		});
		expect(leaf.pr.operations()).toEqual([{ type: "get-prs-for-branches", branches: [] }]);
	});

	it("reports forked descendants parent-before-child with commits, numstat, binary, and PR states", async () => {
		const rows = [
			row("root", "master", ["z-child", "a-child"]),
			row("a-child", "root", ["grandchild"]),
			row("grandchild", "a-child"),
			row("z-child", "root"),
		];
		const run = runDescendantsScenario(
			["gt", "exec", "descendants-report", "root", "--format", "json"],
			rows,
			{
				git: {
					branchComparisons: [
						comparison("root", "a-child", "a1", [
							{ path: "src/a.ts", additions: 4, deletions: 1, binary: false },
							{
								path: "image.png",
								additions: null,
								deletions: null,
								binary: true,
							},
						]),
						comparison("a-child", "grandchild", "g1"),
						comparison("root", "z-child", "z1"),
					],
				},
				pr: {
					prsByBranch: {
						"a-child": {
							number: 12,
							title: "A PR",
							state: "OPEN",
							baseRefName: "root",
						},
					},
					lookupFailures: { "z-child": "GitHub unavailable" },
				},
			},
		);

		expect(await run.exit).toBe(0);
		const output = parseJsonOutput(run);
		expect(output).toMatchObject({
			status: "ok",
			data: {
				complete: true,
				descendantCount: 3,
				edges: [
					{ parent: "root", child: "a-child" },
					{ parent: "a-child", child: "grandchild" },
					{ parent: "root", child: "z-child" },
				],
				descendants: [
					{
						branch: "a-child",
						parent: "root",
						children: ["grandchild"],
						commits: [{ sha: "a1", subject: "Commit a1" }],
						diff: {
							filesChanged: 2,
							insertions: 4,
							deletions: 1,
							files: [
								{ path: "src/a.ts", additions: 4, deletions: 1, binary: false },
								{ path: "image.png", additions: null, deletions: null, binary: true },
							],
						},
						pr: {
							type: "found",
							number: 12,
							title: "A PR",
							state: "OPEN",
							baseRefName: "root",
						},
					},
					{ branch: "grandchild", pr: { type: "none" } },
					{ branch: "z-child", pr: { type: "unavailable", message: "GitHub unavailable" } },
				],
				warnings: [expect.stringContaining("z-child")],
			},
		});
		expect(run.pr.operations()).toEqual([
			{
				type: "get-prs-for-branches",
				branches: ["a-child", "grandchild", "z-child"],
			},
		]);
	});

	it("returns expected negatives for missing local targets and absent Graphite metadata", async () => {
		const missing = runDescendantsScenario(
			["gt", "exec", "descendants-report", "missing", "--format", "json"],
			[row("root", "master")],
		);
		expect(await missing.exit).toBe(1);
		expect(parseJsonOutput(missing)).toMatchObject({
			status: "negative",
			data: { target: "missing" },
		});

		const absent = runScenario(
			["gt", "exec", "descendants-report", "local-only", "--format", "json"],
			{
				git: { localBranches: ["local-only"] },
				gt: { stackGraph: { type: "graph", graph: fakeStackGraphInfo() } },
			},
		);
		expect(await absent.exit).toBe(1);
		expect(parseJsonOutput(absent)).toMatchObject({ data: { target: "local-only" } });
	});

	it("fails with branch, parent, and stage when local branch discovery fails", async () => {
		const run = runDescendantsScenario(
			["gt", "exec", "descendants-report", "root", "--format", "json"],
			[row("root", "master")],
			{ git: { localBranchesFailure: { message: "refs unavailable" } } },
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "local-branches-read-failed",
			message: "Cannot list local branches: refs unavailable",
			data: { branch: "root", parent: "root", stage: "local-branches" },
		});
	});

	it("fails with branch, parent, and stage when required local comparison evidence fails", async () => {
		const run = runDescendantsScenario(
			["gt", "exec", "descendants-report", "root", "--format", "json"],
			[row("root", "master", ["child"]), row("child", "root")],
			{
				git: {
					branchComparisonFailures: [{ parent: "root", branch: "child", message: "bad revision" }],
				},
			},
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "branch-comparison-failed",
			data: { branch: "child", parent: "root", stage: "git-comparison" },
		});
		expect(run.pr.operations()).toEqual([]);
	});

	it("preserves a complete report with unavailable PRs after one failed batch", async () => {
		const rows = [row("root", "master", ["a"]), row("a", "root", ["b"]), row("b", "a")];
		const run = runDescendantsScenario(
			["gt", "exec", "descendants-report", "root", "--format", "json"],
			rows,
			{ pr: { batchLookupFailure: "rate limited" } },
		);
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				complete: true,
				descendants: [
					{ branch: "a", pr: { type: "unavailable", message: "rate limited" } },
					{ branch: "b", pr: { type: "unavailable", message: "rate limited" } },
				],
				warnings: [expect.stringContaining("rate limited")],
			},
		});
	});

	it("treats an omitted PR batch entry as unavailable rather than none", async () => {
		const run = runDescendantsScenario(
			["gt", "exec", "descendants-report", "root", "--format", "json"],
			[row("root", "master", ["child"]), row("child", "root")],
			{ pr: { batchOmittedBranches: ["child"] } },
		);
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				complete: true,
				descendants: [
					{
						branch: "child",
						pr: { type: "unavailable", message: "GitHub PR batch omitted this branch" },
					},
				],
				warnings: [expect.stringContaining("child")],
			},
		});
	});

	it("completes more than four descendants and requests every comparison exactly once", async () => {
		const names = ["a", "b", "c", "d", "e", "f"];
		const rows = [
			row("root", "master", ["a"]),
			...names.map((name, index) =>
				row(name, ["root", ...names][index] ?? "root", names.slice(index + 1, index + 2)),
			),
		];
		const run = runDescendantsScenario(
			["gt", "exec", "descendants-report", "root", "--format", "json"],
			rows,
		);
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { complete: true, descendantCount: 6 },
		});
		expect(
			run.git.operations().filter((operation) => operation.type === "read-branch-comparison"),
		).toHaveLength(6);
	});
});

interface DescendantsScenarioOverrides {
	git?: ScenarioRunOptions["git"];
	pr?: ScenarioRunOptions["pr"];
}

function runDescendantsScenario(
	args: readonly string[],
	rows: readonly GraphiteBranchTopology[],
	overrides: DescendantsScenarioOverrides = {},
) {
	return runScenario(args, {
		git: {
			localBranches: rows.map((candidate) => candidate.branch),
			...overrides.git,
		},
		gt: {
			stackGraph: {
				type: "graph",
				graph: fakeStackGraphInfo({
					topology: new Map(rows.map((candidate) => [candidate.branch, candidate])),
				}),
			},
		},
		...(overrides.pr === undefined ? {} : { pr: overrides.pr }),
	});
}

function comparison(
	parent: string,
	branch: string,
	sha: string,
	files: readonly {
		path: string;
		additions: number | null;
		deletions: number | null;
		binary: boolean;
	}[] = [],
) {
	return {
		parent,
		branch,
		comparison: {
			commits: [{ sha, subject: `Commit ${sha}` }],
			diff: {
				filesChanged: files.length,
				insertions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
				deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
				files,
			},
		},
	};
}

interface StackMapScenarioOptions {
	readonly rows?: readonly GraphiteBranchTopology[];
	readonly diagnostics?: GraphiteTopologyParseDiagnostics;
	readonly stack?: ReturnType<typeof fakeStackInfo>;
	readonly git?: ScenarioRunOptions["git"];
	readonly gt?: ScenarioRunOptions["gt"];
	readonly repo?: ScenarioRunOptions["repo"];
}

function runStackMapScenario(args: readonly string[], options: StackMapScenarioOptions = {}) {
	const rows = options.rows ?? [
		row("master", undefined, ["feature/current"], "TRUNK"),
		row("feature/current", "master"),
	];
	const git = {
		worktrees: [
			{ path: "/repo", branch: "feature/current" },
			slotWorktree("slot-04", "feature/slot"),
		],
		localBranches: rows.map((candidate) => candidate.branch),
		...options.git,
	};
	const graphOptions =
		options.diagnostics === undefined
			? { topology: new Map(rows.map((candidate) => [candidate.branch, candidate])) }
			: {
					topology: new Map(rows.map((candidate) => [candidate.branch, candidate])),
					diagnostics: options.diagnostics,
				};
	return runScenario(args, {
		...(options.repo === undefined ? {} : { repo: options.repo }),
		git,
		gt: {
			stack: {
				type: "stack",
				stack:
					options.stack ??
					fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master"] }),
			},
			stackGraph: { type: "graph", graph: fakeStackGraphInfo(graphOptions) },
			...options.gt,
		},
	});
}

function defaultStackMapRows(): readonly GraphiteBranchTopology[] {
	return [
		row("master", undefined, ["feature/current", "feature/slot", "feature/recent"], "TRUNK"),
		row("feature/current", "master", ["feature/child"], "VALID"),
		row("feature/child", "feature/current", [], "VALID"),
		row("feature/slot", "master", ["feature/restack"], "VALID"),
		row("feature/restack", "feature/slot", [], "BAD_PARENT_NAME"),
		row("feature/recent", "master", [], "VALID"),
	];
}

function row(
	branch: string,
	parent: string | undefined,
	children: readonly string[] = [],
	validationResult = "VALID",
): GraphiteBranchTopology {
	return {
		branch,
		parent,
		children: [...children],
		validationResult,
		isTrunkMarked: validationResult === "TRUNK",
		childrenCorruption: undefined,
	};
}

interface StackMapJsonData {
	readonly branches: readonly {
		readonly name: string;
		readonly validationResult: string | null;
		readonly needsRestack: boolean;
	}[];
	readonly warnings: readonly string[];
}

function jsonData(output: unknown): StackMapJsonData {
	expect(output).toMatchObject({ data: expect.any(Object) });
	return (output as { data: StackMapJsonData }).data;
}

import type { GraphiteBranchTopology, GraphiteTopologyParseDiagnostics } from "@asdl/core/graphite-metadata";
import { describe, expect, it } from "vitest";

import { fakeStackGraphInfo, fakeStackInfo } from "../../src/gateways/fakes/gt.ts";
import { parseJsonOutput, runScenario, slotWorktree, type ScenarioRunOptions } from "../support/run-scenario.ts";

describe("slot gt exec stack-branches CLI", () => {
	it("is hidden but invocable and emits compact branch JSON in human mode", async () => {
		const run = runScenario(["gt", "exec", "stack-branches"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { stack: { type: "stack", stack: fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master", "feature/a"], descendants: ["feature/c"] }) } },
		});
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe('{"branches":["feature/a","feature/current","feature/c"]}\n');
	});

	it("returns the full envelope in JSON mode", async () => {
		const run = runScenario(["gt", "exec", "stack-branches", "--downstack", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { stack: { type: "stack", stack: fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master", "feature/a"], descendants: ["feature/c"] }) } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { branches: ["feature/a", "feature/current"], scope: "downstack", edges: [{ parent: "master", child: "feature/a" }, { parent: "feature/a", child: "feature/current" }] } });
	});

	it("returns a negative result on trunk", async () => {
		const run = runScenario(["gt", "exec", "stack-branches", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }] },
			gt: { stack: { type: "stack", stack: fakeStackInfo({ trunk: "master", current: "master", ancestors: [], descendants: [] }) } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ exit_code: 1, message: "On trunk 'master'; no stack is checked out.", data: { branches: [] } });
	});

	it("fails forked full-stack metadata but only warns for downstack scope", async () => {
		const stack = fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master"], descendants: ["feature/a"], descendantWalk: { forks: [{ branch: "feature/current", children: ["feature/a", "feature/b"] }], childrenCorruptions: [], termination: { type: "completed" } } });
		const full = runScenario(["gt", "exec", "stack-branches", "--format", "json"], { git: { worktrees: [{ path: "/repo", branch: "feature/current" }] }, gt: { stack: { type: "stack", stack } } });
		expect(await full.exit).toBe(2);
		expect(parseJsonOutput(full)).toMatchObject({ error_type: "forked_stack" });
		const down = runScenario(["gt", "exec", "stack-branches", "--downstack"], { git: { worktrees: [{ path: "/repo", branch: "feature/current" }] }, gt: { stack: { type: "stack", stack } } });
		expect(await down.exit).toBe(0);
		expect(down.stderr.join("")).toContain("branch feature/current has 2 Graphite children");
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
		expect(run.stdout.join("")).toBe('{"branches":["master","feature/current","feature/child","feature/slot","feature/restack","feature/recent"]}\n');
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
				recent_limit: 40,
				edges: [
					{ parent: "feature/current", child: "feature/child" },
					{ parent: "master", child: "feature/current" },
					{ parent: "master", child: "feature/recent" },
					{ parent: "feature/slot", child: "feature/restack" },
					{ parent: "master", child: "feature/slot" },
				],
				slots: [{ slot_name: "slot-04", branch: "feature/slot", worktree_path: "/slots/repos/repo/worktrees/slot-04", status: "assigned" }],
				warnings: [],
			},
		});
		const data = jsonData(output);
		expect(data.branches.map((branch) => branch.name)).toEqual(["master", "feature/current", "feature/child", "feature/slot", "feature/restack", "feature/recent"]);
		expect(data.branches.find((branch) => branch.name === "feature/restack")).toMatchObject({ validation_result: "BAD_PARENT_NAME", needs_restack: true });
		expect(run.gt.operations()).toEqual([{ type: "stack", cwd: "/repo" }, { type: "stack-graph", cwd: "/repo" }]);
	});

	it("honors recent limit and recent timestamp ordering without selecting untracked names", async () => {
		const run = runStackMapScenario(["gt", "exec", "stack-map-branches", "--recent-limit", "1", "--format", "json"], {
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
		});

		expect(await run.exit).toBe(0);
		const branches = jsonData(parseJsonOutput(run)).branches.map((branch) => branch.name);
		expect(branches).toContain("feature/newer");
		expect(branches).not.toContain("feature/older");
		expect(branches).not.toContain("feature/untracked");
		expect(branches).not.toContain("feature/unmentioned");
	});

	it("supports zero recent limit and rejects negative recent limit", async () => {
		const zero = runStackMapScenario(["gt", "exec", "stack-map-branches", "--recent-limit", "0", "--format", "json"], {
			rows: [row("master", undefined, ["feature/current"], "TRUNK"), row("feature/current", "master"), row("feature/recent", "master")],
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }], localBranchTips: [{ name: "feature/recent", headIso: "2026-01-02T00:00:00+00:00" }] },
		});
		expect(await zero.exit).toBe(0);
		expect(jsonData(parseJsonOutput(zero)).branches.map((branch) => branch.name)).not.toContain("feature/recent");

		const negative = runStackMapScenario(["gt", "exec", "stack-map-branches", "--recent-limit", "-1", "--format", "json"]);
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
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }], localBranches: ["master", "feature/current"] },
		});

		expect(await run.exit).toBe(0);
		expect(jsonData(parseJsonOutput(run)).branches.map((branch) => branch.name)).toEqual(["master", "feature/current"]);
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
				descendantWalk: { forks: [{ branch: "feature/current", children: ["feature/a", "feature/b"] }], childrenCorruptions: [], termination: { type: "completed" } },
			}),
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
		});

		expect(await run.exit).toBe(0);
		const data = jsonData(parseJsonOutput(run));
		expect(data.warnings).toContain("branch feature/current has 2 Graphite children; descendants follow the first child only");
		expect(data.branches.map((branch) => branch.name)).toEqual(["master", "feature/current", "feature/a", "feature/b"]);
	});

	it("dedupes graph and stack warnings in first-seen order", async () => {
		const diagnostics: GraphiteTopologyParseDiagnostics = { emptyBranchNameRows: 1, childrenCorruptions: [{ branch: "feature/current", kind: "invalid_json" }] };
		const run = runStackMapScenario(["gt", "exec", "stack-map-branches", "--format", "json"], {
			rows: [row("master", undefined, ["feature/current"], "TRUNK"), row("feature/current", "master")],
			diagnostics,
			stack: fakeStackInfo({
				trunk: "master",
				current: "feature/current",
				ancestors: ["master"],
				descendantWalk: { forks: [], childrenCorruptions: [{ branch: "feature/current", kind: "invalid_json" }], termination: { type: "completed" } },
			}),
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
		});

		expect(await run.exit).toBe(0);
		expect(jsonData(parseJsonOutput(run)).warnings).toEqual([
			"Graphite metadata row has an empty branch_name; row ignored",
			"children metadata for feature/current is not valid JSON; treating as no children",
		]);
	});

	it("maps stack-map failure paths to stable error types", async () => {
		const cases = [
			{
				name: "not in repo",
				options: { repo: { type: "no_repo" as const, errorType: "not_in_repo" as const, message: "not in repo" } },
				errorType: "not_in_repo",
			},
			{
				name: "current branch failure",
				options: { git: { currentBranchFailures: { "/repo": { message: "symbolic ref failed" } } } },
				errorType: "git_current_branch_failed",
			},
			{
				name: "detached head",
				options: { git: { worktrees: [{ path: "/repo", branch: null }] } },
				errorType: "detached_head",
			},
			{
				name: "untracked Graphite branch",
				options: { gt: { stack: { type: "untracked_branch" as const, message: "current branch is not tracked by Graphite: feature/current" } } },
				errorType: "untracked_branch",
			},
			{
				name: "gt stack failure",
				options: { gt: { stack: { type: "failure" as const, failure: { message: "metadata unavailable", returnCode: 1 } } } },
				errorType: "gt_stack_read_failed",
			},
			{
				name: "git common dir missing",
				options: { gt: { stackGraph: { type: "git_common_dir_missing" as const, message: "Could not resolve Git common dir for Graphite metadata." } } },
				errorType: "git_common_dir_missing",
			},
			{
				name: "metadata read failure",
				options: { gt: { stackGraph: { type: "failure" as const, failure: { message: "schema mismatch", returnCode: null } } } },
				errorType: "gt_metadata_read_failed",
			},
			{
				name: "missing trunk row",
				options: { gt: { stackGraph: { type: "graph" as const, graph: fakeStackGraphInfo({ topology: new Map([["feature/current", row("feature/current", "master")]]) }) } } },
				errorType: "stack_metadata_inconsistent",
			},
		];

		for (const testCase of cases) {
			const run = runStackMapScenario(["gt", "exec", "stack-map-branches", "--format", "json"], testCase.options);
			expect(await run.exit, testCase.name).toBe(2);
			expect(parseJsonOutput(run), testCase.name).toMatchObject({ error_type: testCase.errorType });
		}
	});
});

interface StackMapScenarioOptions {
	readonly rows?: readonly GraphiteBranchTopology[] | undefined;
	readonly diagnostics?: GraphiteTopologyParseDiagnostics | undefined;
	readonly stack?: ReturnType<typeof fakeStackInfo> | undefined;
	readonly git?: ScenarioRunOptions["git"] | undefined;
	readonly gt?: ScenarioRunOptions["gt"] | undefined;
	readonly repo?: ScenarioRunOptions["repo"] | undefined;
}

function runStackMapScenario(args: readonly string[], options: StackMapScenarioOptions = {}) {
	const rows = options.rows ?? [row("master", undefined, ["feature/current"], "TRUNK"), row("feature/current", "master")];
	const git = {
		worktrees: [{ path: "/repo", branch: "feature/current" }, slotWorktree("slot-04", "feature/slot")],
		localBranches: rows.map((candidate) => candidate.branch),
		...options.git,
	};
	const graphOptions = options.diagnostics === undefined
		? { topology: new Map(rows.map((candidate) => [candidate.branch, candidate])) }
		: { topology: new Map(rows.map((candidate) => [candidate.branch, candidate])), diagnostics: options.diagnostics };
	return runScenario(args, {
		repo: options.repo,
		git,
		gt: {
			stack: { type: "stack", stack: options.stack ?? fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master"] }) },
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

function row(branch: string, parent: string | undefined, children: readonly string[] = [], validationResult = "VALID"): GraphiteBranchTopology {
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
	readonly branches: readonly { readonly name: string; readonly validation_result: string | null; readonly needs_restack: boolean }[];
	readonly warnings: readonly string[];
}

function jsonData(output: unknown): StackMapJsonData {
	expect(output).toMatchObject({ data: expect.any(Object) });
	return (output as { data: StackMapJsonData }).data;
}

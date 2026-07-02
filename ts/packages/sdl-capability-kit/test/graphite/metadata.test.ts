import { describe, expect, test } from "vitest";

import {
	classifySqliteJsonResult,
	detectGraphiteForkViolations,
	graphiteTrunkMarkerStatus,
	hasExpectedGraphiteBranchMetadataSchema,
	filterLiveBranchNames,
	parseGraphiteBranchMetadataRows,
	parseGraphiteChildren,
	reconcileTopologyToLiveBranches,
	walkFirstChildGraphiteDescendants,
	walkGraphiteAncestors,
	walkGraphiteSubtree,
	type GraphiteTopology,
} from "@sdl/capability-kit/graphite/metadata";

function schemaRows(columns: readonly string[]): unknown[] {
	return columns.map((name) => ({ name }));
}

function parseRows(rows: unknown[]): GraphiteTopology {
	const result = parseGraphiteBranchMetadataRows(rows);
	expect(result.type).toBe("ok");
	if (result.type !== "ok") throw new Error("expected parse success");
	return result.topology;
}

describe("Graphite metadata core", () => {
	test("classifies sqlite JSON results as Result values", () => {
		expect(classifySqliteJsonResult({ stdout: "", stderr: "", status: 0 })).toEqual({
			ok: true,
			value: [],
		});
		expect(classifySqliteJsonResult({ stdout: '{"x":1}', stderr: "", status: 0 })).toEqual({
			ok: true,
			value: { x: 1 },
		});
		expect(
			classifySqliteJsonResult({ stdout: "", stderr: "", status: 0, error: { code: "ENOENT" } }),
		).toEqual({
			ok: false,
			error: {
				type: "command-missing",
				code: "sqlite-command-missing",
				message: "sqlite3 command not found",
			},
		});
		expect(classifySqliteJsonResult({ stdout: "", stderr: "bad db", status: 2 })).toEqual({
			ok: false,
			error: {
				type: "nonzero-exit",
				code: "sqlite-nonzero-exit",
				message: "sqlite3 exited with a nonzero status",
				status: 2,
				stderr: "bad db",
			},
		});
		expect(classifySqliteJsonResult({ stdout: "not json", stderr: "", status: 0 })).toEqual({
			ok: false,
			error: {
				type: "invalid-json",
				code: "sqlite-invalid-json",
				message: "sqlite3 output was not valid JSON",
			},
		});
	});

	test("validates required branch_metadata schema columns", () => {
		expect(
			hasExpectedGraphiteBranchMetadataSchema(
				schemaRows(["branch_name", "parent_branch_name", "children", "validation_result"]),
			),
		).toBe(true);
		expect(
			hasExpectedGraphiteBranchMetadataSchema(
				schemaRows(["branch_name", "children", "validation_result"]),
			),
		).toBe(false);
		expect(hasExpectedGraphiteBranchMetadataSchema({})).toBe(false);
	});

	test("parses rows with normalized parents, trunk markers, diagnostics, and corrupt children", () => {
		const result = parseGraphiteBranchMetadataRows([
			{
				branch_name: "main",
				parent_branch_name: "",
				children: '["feature"]',
				validation_result: "trunk",
			},
			{ branch_name: "", children: null },
			{
				branch_name: "feature",
				parent_branch_name: "main",
				children: "not json",
				validation_result: "VALID",
			},
		]);

		expect(result).toMatchObject({
			type: "ok",
			diagnostics: {
				emptyBranchNameRows: 1,
				childrenCorruptions: [{ branch: "feature", kind: "invalid_json" }],
			},
		});
		if (result.type !== "ok") throw new Error("expected parse success");
		expect(result.topology.get("main")).toMatchObject({
			parent: undefined,
			children: ["feature"],
			isTrunkMarked: true,
		});
		expect(result.topology.get("feature")).toMatchObject({
			parent: "main",
			children: [],
			childrenCorruption: { branch: "feature", kind: "invalid_json" },
		});
	});

	test.each([
		["empty", null, [], undefined],
		["not_text", 7, [], { branch: "feature", kind: "not_text" }],
		["invalid_json", "not json", [], { branch: "feature", kind: "invalid_json" }],
		["not_list", "{}", [], { branch: "feature", kind: "not_list" }],
		["non_string", '["a", 1, "b"]', ["a", "b"], { branch: "feature", kind: "non_string" }],
	] as const)("parses children %s", (_name, value, children, corruption) => {
		expect(parseGraphiteChildren("feature", value)).toEqual({ children, corruption });
	});

	test("walks ancestors through completion, missing rows, and cycles", () => {
		const topology = parseRows([
			{ branch_name: "main", children: '["a"]', validation_result: "TRUNK" },
			{ branch_name: "a", parent_branch_name: "main", children: "[]" },
			{ branch_name: "cycle-a", parent_branch_name: "cycle-b", children: "[]" },
			{ branch_name: "cycle-b", parent_branch_name: "cycle-a", children: "[]" },
			{ branch_name: "missing-parent", parent_branch_name: "missing", children: "[]" },
		]);

		expect(walkGraphiteAncestors(topology, "a")).toEqual({
			ancestors: ["main"],
			terminusBranch: "main",
			termination: { type: "completed" },
		});
		expect(walkGraphiteAncestors(topology, "missing-parent")).toEqual({
			ancestors: ["missing"],
			terminusBranch: "missing",
			termination: { type: "row_missing", branch: "missing" },
		});
		expect(walkGraphiteAncestors(topology, "cycle-a")).toEqual({
			ancestors: ["cycle-b"],
			terminusBranch: "cycle-b",
			termination: { type: "cycle", branch: "cycle-a" },
		});
	});

	test("walks first-child descendants with forks, corruptions, missing rows, and cycles", () => {
		const topology = parseRows([
			{ branch_name: "a", children: '["b", "sibling"]' },
			{ branch_name: "b", children: '["missing"]' },
			{ branch_name: "corrupt", children: "not json" },
			{ branch_name: "cycle-a", children: '["cycle-b"]' },
			{ branch_name: "cycle-b", children: '["cycle-a"]' },
		]);

		expect(walkFirstChildGraphiteDescendants(topology, "a")).toMatchObject({
			descendants: ["b", "missing"],
			forks: [{ branch: "a", children: ["b", "sibling"] }],
			termination: { type: "row_missing", branch: "missing" },
		});
		expect(walkFirstChildGraphiteDescendants(topology, "corrupt")).toMatchObject({
			childrenCorruptions: [{ branch: "corrupt", kind: "invalid_json" }],
			termination: { type: "completed" },
		});
		expect(walkFirstChildGraphiteDescendants(topology, "cycle-a")).toMatchObject({
			descendants: ["cycle-b"],
			termination: { type: "cycle", branch: "cycle-a" },
		});
	});

	test("walks subtrees and detects fork violations", () => {
		const topology = parseRows([
			{ branch_name: "main", children: '["a"]' },
			{ branch_name: "a", children: '["b", "side"]' },
			{ branch_name: "b", children: '["c"]' },
			{ branch_name: "c", children: "[]" },
			{ branch_name: "side", children: '["side-child"]' },
			{ branch_name: "side-child", children: "[]" },
		]);

		expect(walkGraphiteSubtree(topology, "a")).toEqual({
			subtree: ["a", "b", "c", "side", "side-child"],
			cycleAt: undefined,
		});
		expect(detectGraphiteForkViolations(topology, ["main", "a", "b"])).toEqual([
			{
				forkPoint: "a",
				expectedChild: "b",
				siblings: [{ branch: "side", subtree: ["side", "side-child"] }],
			},
		]);
	});

	test("reports trunk marker status", () => {
		const topology = parseRows([
			{ branch_name: "main", validation_result: "TRUNK", children: "[]" },
			{ branch_name: "feature", parent_branch_name: "main", children: "[]" },
		]);
		expect(graphiteTrunkMarkerStatus(topology, "main")).toEqual({ type: "clean" });
		expect(graphiteTrunkMarkerStatus(topology, "feature")).toEqual({
			type: "problem",
			terminus: "feature",
			terminusState: "unmarked",
			markedTrunks: ["main"],
		});
	});

	test("filterLiveBranchNames partitions on live membership and preserves order", () => {
		expect(filterLiveBranchNames(["a", "b", "c"], new Set(["a", "c"]))).toEqual({
			kept: ["a", "c"],
			dropped: ["b"],
		});
		expect(filterLiveBranchNames([], new Set(["a"]))).toEqual({ kept: [], dropped: [] });
	});

	test("reconciles the dangling-child incident shape", () => {
		const topology = parseRows([
			{ branch_name: "master", children: '["A"]', validation_result: "TRUNK" },
			{ branch_name: "A", parent_branch_name: "master", children: '["B"]' },
			{ branch_name: "B", parent_branch_name: "A", children: "[]" },
		]);

		const { topology: reconciled, droppedBranches } = reconcileTopologyToLiveBranches(
			topology,
			new Set(["master", "A"]),
		);

		expect(droppedBranches).toEqual(["B"]);
		expect(reconciled.has("B")).toBe(false);
		expect(reconciled.get("A")?.children).toEqual([]);
		expect(reconciled.get("master")?.children).toEqual(["A"]);
	});

	test("drops a dead fork sibling while keeping live siblings", () => {
		const topology = parseRows([
			{ branch_name: "a", children: '["live", "dead"]' },
			{ branch_name: "live", parent_branch_name: "a", children: "[]" },
			{ branch_name: "dead", parent_branch_name: "a", children: "[]" },
		]);

		const oneDead = reconcileTopologyToLiveBranches(topology, new Set(["a", "live"]));
		expect(oneDead.topology.get("a")?.children).toEqual(["live"]);
		expect(oneDead.droppedBranches).toEqual(["dead"]);

		const bothLive = reconcileTopologyToLiveBranches(topology, new Set(["a", "live", "dead"]));
		expect(bothLive.topology.get("a")?.children).toEqual(["live", "dead"]);
		expect(bothLive.droppedBranches).toEqual([]);
	});

	test("reports a branch dropped as both row and child only once", () => {
		const topology = parseRows([
			{ branch_name: "a", children: '["gone"]' },
			{ branch_name: "gone", parent_branch_name: "a", children: "[]" },
		]);

		const { droppedBranches } = reconcileTopologyToLiveBranches(topology, new Set(["a"]));
		expect(droppedBranches).toEqual(["gone"]);
	});

	test("preserves parent, trunk marker, and corruption on survivors without mutating input", () => {
		const topology = parseRows([
			{ branch_name: "main", children: '["a"]', validation_result: "TRUNK" },
			{ branch_name: "a", parent_branch_name: "main", children: "not json" },
		]);
		const before = topology.get("main")?.children;

		const { topology: reconciled } = reconcileTopologyToLiveBranches(
			topology,
			new Set(["main", "a"]),
		);

		expect(reconciled.get("main")).toMatchObject({ isTrunkMarked: true });
		expect(reconciled.get("a")).toMatchObject({
			parent: "main",
			childrenCorruption: { branch: "a", kind: "invalid_json" },
		});
		// Input topology is untouched.
		expect(topology.get("main")?.children).toBe(before);
		expect(topology.has("a")).toBe(true);
	});

	test("empty live set drops everything", () => {
		const topology = parseRows([
			{ branch_name: "main", children: '["a"]', validation_result: "TRUNK" },
			{ branch_name: "a", parent_branch_name: "main", children: "[]" },
		]);

		const { topology: reconciled, droppedBranches } = reconcileTopologyToLiveBranches(
			topology,
			new Set(),
		);
		expect(reconciled.size).toBe(0);
		expect(droppedBranches).toEqual(["a", "main"]);
	});
});

import { describe, expect, test } from "vitest";

import {
	detectGraphiteForkViolations,
	graphiteTrunkMarkerStatus,
	hasExpectedGraphiteBranchMetadataSchema,
	parseGraphiteBranchMetadataRows,
	parseGraphiteChildren,
	walkFirstChildGraphiteDescendants,
	walkGraphiteAncestors,
	walkGraphiteSubtree,
	type GraphiteTopology,
} from "@asdl/core/graphite-metadata";

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
	test("validates required branch_metadata schema columns", () => {
		expect(hasExpectedGraphiteBranchMetadataSchema(schemaRows(["branch_name", "parent_branch_name", "children", "validation_result"]))).toBe(true);
		expect(hasExpectedGraphiteBranchMetadataSchema(schemaRows(["branch_name", "children", "validation_result"]))).toBe(false);
		expect(hasExpectedGraphiteBranchMetadataSchema({})).toBe(false);
	});

	test("parses rows with normalized parents, trunk markers, diagnostics, and corrupt children", () => {
		const result = parseGraphiteBranchMetadataRows([
			{ branch_name: "main", parent_branch_name: "", children: '["feature"]', validation_result: "trunk" },
			{ branch_name: "", children: null },
			{ branch_name: "feature", parent_branch_name: "main", children: "not json", validation_result: "VALID" },
		]);

		expect(result).toMatchObject({ type: "ok", diagnostics: { emptyBranchNameRows: 1, childrenCorruptions: [{ branch: "feature", kind: "invalid_json" }] } });
		if (result.type !== "ok") throw new Error("expected parse success");
		expect(result.topology.get("main")).toMatchObject({ parent: undefined, children: ["feature"], isTrunkMarked: true });
		expect(result.topology.get("feature")).toMatchObject({ parent: "main", children: [], childrenCorruption: { branch: "feature", kind: "invalid_json" } });
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

		expect(walkGraphiteAncestors(topology, "a")).toEqual({ ancestors: ["main"], terminusBranch: "main", termination: { type: "completed" } });
		expect(walkGraphiteAncestors(topology, "missing-parent")).toEqual({ ancestors: ["missing"], terminusBranch: "missing", termination: { type: "row_missing", branch: "missing" } });
		expect(walkGraphiteAncestors(topology, "cycle-a")).toEqual({ ancestors: ["cycle-b"], terminusBranch: "cycle-b", termination: { type: "cycle", branch: "cycle-a" } });
	});

	test("walks first-child descendants with forks, corruptions, missing rows, and cycles", () => {
		const topology = parseRows([
			{ branch_name: "a", children: '["b", "sibling"]' },
			{ branch_name: "b", children: '["missing"]' },
			{ branch_name: "corrupt", children: "not json" },
			{ branch_name: "cycle-a", children: '["cycle-b"]' },
			{ branch_name: "cycle-b", children: '["cycle-a"]' },
		]);

		expect(walkFirstChildGraphiteDescendants(topology, "a")).toMatchObject({ descendants: ["b", "missing"], forks: [{ branch: "a", children: ["b", "sibling"] }], termination: { type: "row_missing", branch: "missing" } });
		expect(walkFirstChildGraphiteDescendants(topology, "corrupt")).toMatchObject({ childrenCorruptions: [{ branch: "corrupt", kind: "invalid_json" }], termination: { type: "completed" } });
		expect(walkFirstChildGraphiteDescendants(topology, "cycle-a")).toMatchObject({ descendants: ["cycle-b"], termination: { type: "cycle", branch: "cycle-a" } });
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

		expect(walkGraphiteSubtree(topology, "a")).toEqual({ subtree: ["a", "b", "c", "side", "side-child"], cycleAt: undefined });
		expect(detectGraphiteForkViolations(topology, ["main", "a", "b"])).toEqual([
			{ forkPoint: "a", expectedChild: "b", siblings: [{ branch: "side", subtree: ["side", "side-child"] }] },
		]);
	});

	test("reports trunk marker status", () => {
		const topology = parseRows([
			{ branch_name: "main", validation_result: "TRUNK", children: "[]" },
			{ branch_name: "feature", parent_branch_name: "main", children: "[]" },
		]);
		expect(graphiteTrunkMarkerStatus(topology, "main")).toEqual({ type: "clean" });
		expect(graphiteTrunkMarkerStatus(topology, "feature")).toEqual({ type: "problem", terminus: "feature", terminusState: "unmarked", markedTrunks: ["main"] });
	});
});

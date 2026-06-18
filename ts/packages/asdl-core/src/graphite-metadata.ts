import { join } from "node:path";

import { isRecord } from "./primitives.ts";

const GRAPHITE_TRUNK_VALIDATION_RESULT = "TRUNK";
const REQUIRED_BRANCH_METADATA_COLUMNS = ["branch_name", "parent_branch_name", "children", "validation_result"] as const;

export const GRAPHITE_METADATA_DB_NAME = ".graphite_metadata.db";
export const GRAPHITE_BRANCH_METADATA_QUERY = "SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata";

export function graphiteMetadataDbPath(commonGitDir: string): string {
	return join(commonGitDir, GRAPHITE_METADATA_DB_NAME);
}

export function graphiteBranchMetadataSchemaQuery(): string {
	return "PRAGMA table_info(branch_metadata)";
}

export function graphiteBranchMetadataQuery(): string {
	return GRAPHITE_BRANCH_METADATA_QUERY;
}

export function sqliteTextLiteral(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

export interface GraphiteBranchTopology {
	readonly branch: string;
	readonly parent: string | undefined;
	readonly children: readonly string[];
	readonly isTrunkMarked: boolean;
	readonly childrenCorruption: GraphiteChildrenCorruption | undefined;
}

export type GraphiteTopology = ReadonlyMap<string, GraphiteBranchTopology>;

export type GraphiteChildrenCorruptionKind = "not_text" | "invalid_json" | "not_list" | "non_string";

export interface GraphiteChildrenCorruption {
	readonly branch: string;
	readonly kind: GraphiteChildrenCorruptionKind;
}

export interface GraphiteTopologyParseDiagnostics {
	readonly emptyBranchNameRows: number;
	readonly childrenCorruptions: readonly GraphiteChildrenCorruption[];
}

export type GraphiteTopologyParseResult =
	| { readonly type: "ok"; readonly topology: GraphiteTopology; readonly diagnostics: GraphiteTopologyParseDiagnostics }
	| { readonly type: "schema_mismatch" }
	| { readonly type: "not_array" };

export function hasExpectedGraphiteBranchMetadataSchema(value: unknown): boolean {
	if (!Array.isArray(value)) return false;
	const names = new Set<string>();
	for (const row of value) {
		const name = isRecord(row) ? metadataText(row.name) : undefined;
		if (name !== undefined) names.add(name);
	}
	return REQUIRED_BRANCH_METADATA_COLUMNS.every((column) => names.has(column));
}

export function parseGraphiteBranchMetadataRows(value: unknown): GraphiteTopologyParseResult {
	if (!Array.isArray(value)) return { type: "not_array" };

	const topology = new Map<string, GraphiteBranchTopology>();
	const childrenCorruptions: GraphiteChildrenCorruption[] = [];
	let emptyBranchNameRows = 0;

	for (const row of value) {
		if (!isRecord(row)) continue;
		const branch = metadataText(row.branch_name);
		if (branch === undefined) {
			emptyBranchNameRows += 1;
			continue;
		}

		const parsedChildren = parseGraphiteChildren(branch, row.children);
		if (parsedChildren.corruption !== undefined) childrenCorruptions.push(parsedChildren.corruption);
		topology.set(branch, {
			branch,
			parent: metadataText(row.parent_branch_name),
			children: parsedChildren.children,
			isTrunkMarked: metadataText(row.validation_result)?.toUpperCase() === GRAPHITE_TRUNK_VALIDATION_RESULT,
			childrenCorruption: parsedChildren.corruption,
		});
	}

	return { type: "ok", topology, diagnostics: { emptyBranchNameRows, childrenCorruptions } };
}

export function parseGraphiteChildren(branch: string, value: unknown): { readonly children: readonly string[]; readonly corruption: GraphiteChildrenCorruption | undefined } {
	if (value === null || value === undefined || value === "") return { children: [], corruption: undefined };
	if (typeof value !== "string") return { children: [], corruption: { branch, kind: "not_text" } };

	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return { children: [], corruption: { branch, kind: "invalid_json" } };
	}

	if (!Array.isArray(parsed)) return { children: [], corruption: { branch, kind: "not_list" } };
	const children = parsed.filter((child): child is string => typeof child === "string");
	return { children, corruption: children.length === parsed.length ? undefined : { branch, kind: "non_string" } };
}

export type GraphiteWalkTermination =
	| { readonly type: "completed" }
	| { readonly type: "cycle"; readonly branch: string }
	| { readonly type: "row_missing"; readonly branch: string };

export interface GraphiteAncestorWalk {
	readonly ancestors: readonly string[];
	readonly terminusBranch: string;
	readonly termination: GraphiteWalkTermination;
}

export interface GraphiteFork {
	readonly branch: string;
	readonly children: readonly string[];
}

export interface GraphiteDescendantWalk {
	readonly descendants: readonly string[];
	readonly forks: readonly GraphiteFork[];
	readonly childrenCorruptions: readonly GraphiteChildrenCorruption[];
	readonly termination: GraphiteWalkTermination;
}

export interface GraphiteSubtreeWalk {
	readonly subtree: readonly string[];
	readonly cycleAt: string | undefined;
}

export interface GraphiteForkViolation {
	readonly forkPoint: string;
	readonly expectedChild: string | undefined;
	readonly siblings: readonly { readonly branch: string; readonly subtree: readonly string[] }[];
}

export type GraphiteTrunkMarkerStatus =
	| { readonly type: "clean" }
	| { readonly type: "problem"; readonly terminus: string; readonly terminusState: "row_missing" | "unmarked" | "marked"; readonly markedTrunks: readonly string[] };

export function selectGraphiteBranch(topology: GraphiteTopology, currentBranch: string): GraphiteBranchTopology | undefined {
	return topology.get(currentBranch);
}

export function walkGraphiteAncestors(topology: GraphiteTopology, currentBranch: string): GraphiteAncestorWalk {
	const reversed: string[] = [];
	let branch = currentBranch;
	const visited = new Set([currentBranch]);
	while (true) {
		const row = topology.get(branch);
		if (row === undefined) return { ancestors: [...reversed].reverse(), terminusBranch: branch, termination: { type: "row_missing", branch } };
		const parent = row.parent;
		if (parent === undefined) return { ancestors: [...reversed].reverse(), terminusBranch: branch, termination: { type: "completed" } };
		if (visited.has(parent)) return { ancestors: [...reversed].reverse(), terminusBranch: branch, termination: { type: "cycle", branch: parent } };
		reversed.push(parent);
		if (!topology.has(parent)) return { ancestors: [...reversed].reverse(), terminusBranch: parent, termination: { type: "row_missing", branch: parent } };
		visited.add(parent);
		branch = parent;
	}
}

export function walkFirstChildGraphiteDescendants(topology: GraphiteTopology, currentBranch: string): GraphiteDescendantWalk {
	const descendants: string[] = [];
	const forks: GraphiteFork[] = [];
	const childrenCorruptions: GraphiteChildrenCorruption[] = [];
	let branch = currentBranch;
	const visited = new Set([currentBranch]);
	while (true) {
		const row = topology.get(branch);
		if (row === undefined) return { descendants, forks, childrenCorruptions, termination: { type: "row_missing", branch } };
		if (row.childrenCorruption !== undefined) childrenCorruptions.push(row.childrenCorruption);
		if (row.children.length > 1) forks.push({ branch, children: row.children });
		const child = row.children[0];
		if (child === undefined) return { descendants, forks, childrenCorruptions, termination: { type: "completed" } };
		if (visited.has(child)) return { descendants, forks, childrenCorruptions, termination: { type: "cycle", branch: child } };
		descendants.push(child);
		if (!topology.has(child)) return { descendants, forks, childrenCorruptions, termination: { type: "row_missing", branch: child } };
		visited.add(child);
		branch = child;
	}
}

export function walkGraphiteSubtree(topology: GraphiteTopology, root: string): GraphiteSubtreeWalk {
	const subtree = [root];
	const visited = new Set<string>([root]);
	const pending = [...(topology.get(root)?.children ?? [])].reverse();
	while (pending.length > 0) {
		const branch = pending.pop();
		if (branch === undefined) break;
		if (visited.has(branch)) return { subtree, cycleAt: branch };
		visited.add(branch);
		subtree.push(branch);
		const children = topology.get(branch)?.children ?? [];
		for (let index = children.length - 1; index >= 0; index -= 1) {
			const child = children[index];
			if (child !== undefined) pending.push(child);
		}
	}
	return { subtree, cycleAt: undefined };
}

export function detectGraphiteForkViolations(topology: GraphiteTopology, landingPath: readonly string[]): readonly GraphiteForkViolation[] {
	const violations: GraphiteForkViolation[] = [];
	for (let index = 0; index < landingPath.length; index += 1) {
		const branch = landingPath[index];
		if (branch === undefined) continue;
		const children = topology.get(branch)?.children ?? [];
		const expectedChild = landingPath[index + 1];

		if (expectedChild === undefined) {
			if (children.length > 1) {
				violations.push({ forkPoint: branch, expectedChild: undefined, siblings: children.map((child) => siblingSubtree(topology, child)) });
			}
			continue;
		}

		const extras = children.filter((child) => child !== expectedChild);
		if (extras.length > 0) {
			violations.push({ forkPoint: branch, expectedChild, siblings: extras.map((child) => siblingSubtree(topology, child)) });
		}
	}
	return violations;
}

export function graphiteTrunkMarkerStatus(topology: GraphiteTopology, terminus: string): GraphiteTrunkMarkerStatus {
	const markedTrunks = [...topology.values()].filter((row) => row.isTrunkMarked).map((row) => row.branch);
	const terminusRow = topology.get(terminus);
	if (terminusRow === undefined) return { type: "problem", terminus, terminusState: "row_missing", markedTrunks };
	const terminusState = terminusRow.isTrunkMarked ? "marked" : "unmarked";
	return terminusState === "marked" && markedTrunks.length === 1 && markedTrunks[0] === terminus ? { type: "clean" } : { type: "problem", terminus, terminusState, markedTrunks };
}

function siblingSubtree(topology: GraphiteTopology, sibling: string): { readonly branch: string; readonly subtree: readonly string[] } {
	return { branch: sibling, subtree: walkGraphiteSubtree(topology, sibling).subtree };
}

function metadataText(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const text = value.trim();
	return text.length > 0 ? text : undefined;
}

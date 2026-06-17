import { existsSync } from "node:fs";

import { DatabaseSync } from "node:sqlite";

import { commandFailure, type BranchMetadataGraph, type BranchMetadataGraphRow, type ChildrenCorruption, type DescendantWalk, type GtCommandFailure, type StackFork, type StackInfo, type TrunkMarkerStatus, type UntrackedBranch, type WalkTermination } from "./types.ts";

const REQUIRED_COLUMNS = new Set(["branch_name", "parent_branch_name", "children", "validation_result"]);

type SqliteValue = string | number | bigint | Uint8Array | null;
type SqliteRecord = Record<string, SqliteValue>;

export function readBranchGraphFromMetadataDb(dbPath: string): BranchMetadataGraph | GtCommandFailure {
	if (!existsSync(dbPath)) return commandFailure(`Graphite metadata store not found at ${dbPath}`);
	const loaded = loadBranchMetadata(dbPath);
	if ("message" in loaded) return loaded;
	return { rows: [...loaded.rows.values()].sort((left, right) => left.name.localeCompare(right.name)), empty_branch_name_rows: loaded.emptyBranchNameRows };
}

export function readStackFromMetadataDb(dbPath: string, currentBranch: string): StackInfo | UntrackedBranch | GtCommandFailure {
	if (!existsSync(dbPath)) return commandFailure(`Graphite metadata store not found at ${dbPath}`);
	const loaded = loadBranchMetadata(dbPath);
	if ("message" in loaded) return loaded;
	if (!loaded.rows.has(currentBranch)) return { type: "untracked_branch", message: `current branch is not tracked by Graphite: ${currentBranch}` };
	const [ancestors, terminusBranch, ancestorTermination] = walkAncestors(loaded.rows, currentBranch);
	const [descendants, descendantWalk] = walkFirstChildDescendants(loaded.rows, currentBranch);
	const consumed = new Set(descendantWalk.children_corruptions.map((corruption) => corruption.branch));
	const unwalked = [...loaded.rows.values()].flatMap((row) => row.children_corruption !== null && !consumed.has(row.children_corruption.branch) ? [row.children_corruption] : []);
	return {
		trunk: ancestors[0] ?? currentBranch,
		current: currentBranch,
		ancestors,
		children: loaded.rows.get(currentBranch)?.children ?? [],
		descendants,
		ancestor_termination: ancestorTermination,
		descendant_walk: descendantWalk,
		trunk_marker: trunkMarkerStatus(loaded.rows, terminusBranch),
		unwalked_children_corruptions: unwalked,
		empty_branch_name_rows: loaded.emptyBranchNameRows,
	};
}

function loadBranchMetadata(dbPath: string): { rows: Map<string, BranchMetadataGraphRow>; emptyBranchNameRows: number } | GtCommandFailure {
	let db: DatabaseSync;
	try {
		db = new DatabaseSync(dbPath, { readOnly: true });
	} catch (error) {
		return commandFailure(`Graphite metadata store unreadable: ${errorMessage(error)}`);
	}
	try {
		const tableInfo = db.prepare("PRAGMA table_info(branch_metadata)").all() as SqliteRecord[];
		const columns = new Set(tableInfo.map((record) => record.name).filter((name): name is string => typeof name === "string"));
		for (const required of REQUIRED_COLUMNS) {
			if (!columns.has(required)) return commandFailure(`Graphite metadata schema mismatch: branch_metadata missing required column ${required}`);
		}
		const records = db.prepare("SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata").all() as SqliteRecord[];
		const rows = new Map<string, BranchMetadataGraphRow>();
		let emptyBranchNameRows = 0;
		for (const record of records) {
			const branchName = record.branch_name;
			if (typeof branchName !== "string" || branchName.length === 0) {
				emptyBranchNameRows += 1;
				continue;
			}
			const parsed = parseChildren(branchName, record.children ?? null);
			rows.set(branchName, {
				name: branchName,
				parent: metadataText(record.parent_branch_name ?? null),
				children: parsed.children,
				validation_result: metadataText(record.validation_result ?? null),
				children_corruption: parsed.corruption,
			});
		}
		return { rows, emptyBranchNameRows };
	} catch (error) {
		const message = errorMessage(error);
		if (message.startsWith("no such table") || message.startsWith("no such column")) return commandFailure(`Graphite metadata schema mismatch: ${message}`);
		return commandFailure(`Graphite metadata store unreadable: ${message}`);
	} finally {
		db.close();
	}
}

function parseChildren(branchName: string, rawChildren: SqliteValue): { children: readonly string[]; corruption: ChildrenCorruption | null } {
	if (rawChildren === null) return { children: [], corruption: null };
	if (typeof rawChildren !== "string") return { children: [], corruption: { branch: branchName, kind: "not_text" } };
	if (rawChildren.length === 0) return { children: [], corruption: null };
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawChildren);
	} catch {
		return { children: [], corruption: { branch: branchName, kind: "invalid_json" } };
	}
	if (!Array.isArray(parsed)) return { children: [], corruption: { branch: branchName, kind: "not_list" } };
	const children = parsed.filter((child): child is string => typeof child === "string");
	return { children, corruption: children.length === parsed.length ? null : { branch: branchName, kind: "non_string" } };
}

function metadataText(value: SqliteValue): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function walkAncestors(rows: Map<string, BranchMetadataGraphRow>, currentBranch: string): [readonly string[], string, WalkTermination] {
	const reversed: string[] = [];
	let branch = currentBranch;
	const visited = new Set([currentBranch]);
	while (true) {
		const row = rows.get(branch);
		if (row === undefined || row.parent === null) return [reversed.reverse(), branch, { type: "completed" }];
		if (visited.has(row.parent)) return [reversed.reverse(), branch, { type: "cycle", branch: row.parent }];
		reversed.push(row.parent);
		if (!rows.has(row.parent)) return [reversed.reverse(), row.parent, { type: "row_missing", branch: row.parent }];
		visited.add(row.parent);
		branch = row.parent;
	}
}

function walkFirstChildDescendants(rows: Map<string, BranchMetadataGraphRow>, currentBranch: string): [readonly string[], DescendantWalk] {
	const descendants: string[] = [];
	const forks: StackFork[] = [];
	const corruptions: ChildrenCorruption[] = [];
	let branch = currentBranch;
	const visited = new Set([currentBranch]);
	while (true) {
		const row = rows.get(branch);
		if (row === undefined) return [descendants, { forks, children_corruptions: corruptions, termination: { type: "row_missing", branch } }];
		if (row.children_corruption !== null) corruptions.push(row.children_corruption);
		if (row.children.length > 1) forks.push({ branch, children: row.children });
		const child = row.children[0];
		if (child === undefined) return [descendants, { forks, children_corruptions: corruptions, termination: { type: "completed" } }];
		if (visited.has(child)) return [descendants, { forks, children_corruptions: corruptions, termination: { type: "cycle", branch: child } }];
		descendants.push(child);
		if (!rows.has(child)) return [descendants, { forks, children_corruptions: corruptions, termination: { type: "row_missing", branch: child } }];
		visited.add(child);
		branch = child;
	}
}

function trunkMarkerStatus(rows: Map<string, BranchMetadataGraphRow>, terminusBranch: string): TrunkMarkerStatus {
	const markedTrunks = [...rows.values()].filter((row) => row.validation_result === "TRUNK").map((row) => row.name);
	const terminus = rows.get(terminusBranch);
	if (terminus === undefined) return { type: "problem", terminus: terminusBranch, terminus_state: "row_missing", marked_trunks: markedTrunks };
	const terminusState = terminus.validation_result === "TRUNK" ? "marked" : "unmarked";
	if (terminusState === "marked" && markedTrunks.length === 1 && markedTrunks[0] === terminusBranch) return { type: "clean" };
	return { type: "problem", terminus: terminusBranch, terminus_state: terminusState, marked_trunks: markedTrunks };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

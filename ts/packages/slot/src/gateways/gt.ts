import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";

import type { SlotGitGateway } from "./git.ts";

const SLOT_GT_TIMEOUT_MS = 10_000;
const SQLITE_QUERY_TIMEOUT_MS = 1_000;
const GRAPHITE_METADATA_DB_NAME = ".graphite_metadata.db";
const REQUIRED_BRANCH_METADATA_COLUMNS = ["branch_name", "parent_branch_name", "children", "validation_result"] as const;

export interface GtCommandFailure {
	message: string;
	returnCode: number | null;
}

export type ParentOfResult =
	| { type: "parent"; branch: string }
	| { type: "no_parent" }
	| { type: "untracked_branch"; message: string }
	| { type: "failure"; failure: GtCommandFailure };

export type ChildrenOfResult =
	| { type: "children"; branches: readonly string[] }
	| { type: "untracked_branch"; message: string }
	| { type: "failure"; failure: GtCommandFailure };

export type TrunkResult =
	| { type: "trunk"; branch: string }
	| { type: "failure"; failure: GtCommandFailure };

export type StackResult =
	| { type: "stack"; stack: StackInfo }
	| { type: "untracked_branch"; message: string }
	| { type: "failure"; failure: GtCommandFailure };

export type WalkTermination = { type: "completed" } | { type: "cycle"; branch: string } | { type: "row_missing"; branch: string };

export type ChildrenCorruptionKind = "not_text" | "invalid_json" | "not_list" | "non_string";

export interface ChildrenCorruption {
	branch: string;
	kind: ChildrenCorruptionKind;
}

export interface StackFork {
	branch: string;
	children: readonly string[];
}

export interface DescendantWalk {
	forks: readonly StackFork[];
	childrenCorruptions: readonly ChildrenCorruption[];
	termination: WalkTermination;
}

export type TrunkMarkerStatus = { type: "clean" } | { type: "problem"; terminus: string; terminusState: "row_missing" | "unmarked" | "marked"; markedTrunks: readonly string[] };

export interface StackInfo {
	trunk: string;
	current: string;
	ancestors: readonly string[];
	children: readonly string[];
	descendants: readonly string[];
	ancestorTermination: WalkTermination;
	descendantWalk: DescendantWalk;
	trunkMarker: TrunkMarkerStatus;
	unwalkedChildrenCorruptions: readonly ChildrenCorruption[];
	emptyBranchNameRows: number;
}

export interface SlotGtGateway {
	parentOf(cwd: string): Promise<ParentOfResult>;
	childrenOf(cwd: string): Promise<ChildrenOfResult>;
	trunk(cwd: string): Promise<TrunkResult>;
	stack(cwd: string): Promise<StackResult>;
}

export interface SqliteJsonRunnerResult {
	stdout: string;
	stderr: string;
	status: number | null;
	error?: unknown;
}

export interface SqliteJsonRunner {
	run(dbPath: string, query: string): SqliteJsonRunnerResult;
}

export class RealSlotGtGateway implements SlotGtGateway {
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;
	private readonly git: SlotGitGateway;
	private readonly sqliteRunner: SqliteJsonRunner;

	constructor(options: { git: SlotGitGateway; env?: NodeJS.ProcessEnv | undefined; execApi?: CommandExecApi | undefined; sqliteRunner?: SqliteJsonRunner | undefined }) {
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
		this.git = options.git;
		this.sqliteRunner = options.sqliteRunner ?? new RealSqliteJsonRunner();
	}

	async parentOf(cwd: string): Promise<ParentOfResult> {
		const result = await this.run("gt", ["parent", "--no-interactive"], cwd);
		if (!result.isOk) {
			const failure = failureFromCommandResult(result);
			if (failure.message.toLowerCase().includes("untracked branch")) return { type: "untracked_branch", message: failure.message };
			return { type: "failure", failure };
		}
		const branch = firstNonemptyLine(result.stdout);
		return branch === null ? { type: "no_parent" } : { type: "parent", branch };
	}

	async childrenOf(cwd: string): Promise<ChildrenOfResult> {
		const result = await this.run("gt", ["children", "--no-interactive"], cwd);
		if (!result.isOk) {
			const failure = failureFromCommandResult(result);
			if (failure.message.toLowerCase().includes("untracked branch")) return { type: "untracked_branch", message: failure.message };
			return { type: "failure", failure };
		}
		return { type: "children", branches: nonemptyLines(result.stdout) };
	}

	async trunk(cwd: string): Promise<TrunkResult> {
		const result = await this.run("gt", ["trunk", "--no-interactive"], cwd);
		if (!result.isOk) return { type: "failure", failure: failureFromCommandResult(result) };
		const branch = firstNonemptyLine(result.stdout);
		if (branch === null) return { type: "failure", failure: { message: "gt trunk returned no branch", returnCode: null } };
		return { type: "trunk", branch };
	}

	async stack(cwd: string): Promise<StackResult> {
		const commonDir = await this.resolveGitCommonDir(cwd);
		if (commonDir === null) return { type: "failure", failure: { message: "Failed to resolve git common dir for Graphite metadata", returnCode: null } };
		const current = await this.resolveCurrentBranch(cwd);
		if (current.type === "failure") return { type: "failure", failure: current.failure };
		if (current.type === "detached") return { type: "failure", failure: { message: `HEAD at ${cwd} is detached. Check out a branch first.`, returnCode: null } };
		return readStackFromMetadataDb(join(commonDir, GRAPHITE_METADATA_DB_NAME), current.branch, this.sqliteRunner);
	}

	private async resolveGitCommonDir(cwd: string): Promise<string | null> {
		return await this.git.getGitCommonDir(cwd);
	}

	private async resolveCurrentBranch(cwd: string): Promise<{ type: "branch"; branch: string } | { type: "detached" } | { type: "failure"; failure: GtCommandFailure }> {
		const result = await this.git.getCurrentBranch(cwd);
		if (result.type === "branch") return result;
		if (result.type === "detached") return result;
		return { type: "failure", failure: { message: result.failure.message, returnCode: null } };
	}

	private async run(command: string, args: readonly string[], cwd: string): Promise<CommandResult> {
		const result = await this.execApi.exec(command, [...args], { cwd, env: this.env, timeout: SLOT_GT_TIMEOUT_MS });
		return { isOk: result.code === 0 && !result.killed, stdout: result.stdout, stderr: result.stderr, code: result.code, killed: result.killed };
	}
}

interface CommandResult {
	isOk: boolean;
	stdout: string;
	stderr: string;
	code: number | null;
	killed: boolean;
}

interface BranchMetadataRow {
	name: string;
	parent: string | null;
	children: readonly string[];
	validationResult: string | null;
	childrenCorruption: ChildrenCorruption | null;
}

function failureFromCommandResult(result: CommandResult): GtCommandFailure {
	const output = result.stderr.trim() || result.stdout.trim() || (result.killed ? "command was killed" : "command failed");
	return { message: output, returnCode: result.code };
}

function firstNonemptyLine(text: string): string | null {
	return nonemptyLines(text)[0] ?? null;
}

function nonemptyLines(text: string): readonly string[] {
	return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

class RealSqliteJsonRunner implements SqliteJsonRunner {
	run(dbPath: string, query: string): SqliteJsonRunnerResult {
		const result = spawnSync("sqlite3", ["-json", dbPath, query], { encoding: "utf8", timeout: SQLITE_QUERY_TIMEOUT_MS });
		return { stdout: result.stdout, stderr: result.stderr, status: result.status, error: result.error };
	}
}

function readStackFromMetadataDb(dbPath: string, currentBranch: string, sqliteRunner: SqliteJsonRunner): StackResult {
	if (!existsSync(dbPath)) return { type: "failure", failure: { message: `Graphite metadata store not found at ${dbPath}`, returnCode: null } };
	const loaded = loadBranchMetadata(dbPath, sqliteRunner);
	if (loaded.type === "failure") return { type: "failure", failure: loaded.failure };
	const row = loaded.rows.get(currentBranch);
	if (row === undefined) return { type: "untracked_branch", message: `current branch is not tracked by Graphite: ${currentBranch}` };
	const ancestors = walkAncestors(loaded.rows, currentBranch);
	const descendants = walkFirstChildDescendants(loaded.rows, currentBranch);
	const trunkMarker = trunkMarkerStatus(loaded.rows, ancestors.terminusBranch);
	const consumed = new Set(descendants.walk.childrenCorruptions.map((corruption) => corruption.branch));
	const unwalked = [...loaded.rows.values()].flatMap((candidate) => candidate.childrenCorruption !== null && !consumed.has(candidate.childrenCorruption.branch) ? [candidate.childrenCorruption] : []);
	return {
		type: "stack",
		stack: {
			trunk: ancestors.ancestors[0] ?? currentBranch,
			current: currentBranch,
			ancestors: ancestors.ancestors,
			children: row.children,
			descendants: descendants.descendants,
			ancestorTermination: ancestors.termination,
			descendantWalk: descendants.walk,
			trunkMarker,
			unwalkedChildrenCorruptions: unwalked,
			emptyBranchNameRows: loaded.emptyBranchNameRows,
		},
	};
}

function loadBranchMetadata(dbPath: string, sqliteRunner: SqliteJsonRunner): { type: "ok"; rows: Map<string, BranchMetadataRow>; emptyBranchNameRows: number } | { type: "failure"; failure: GtCommandFailure } {
	const schemaRows = runSqliteJsonQuery(sqliteRunner, dbPath, "PRAGMA table_info(branch_metadata)");
	if (schemaRows.type === "failure") return schemaRows;
	if (!hasExpectedBranchMetadataSchema(schemaRows.data)) return { type: "failure", failure: { message: "Graphite metadata schema mismatch: branch_metadata missing required column", returnCode: null } };
	const result = runSqliteJsonQuery(sqliteRunner, dbPath, "SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata");
	if (result.type === "failure") return result;
	const rows = new Map<string, BranchMetadataRow>();
	let emptyBranchNameRows = 0;
	for (const record of metadataRowsFromValue(result.data)) {
		const branchName = metadataText(record.branch_name);
		if (branchName === null) {
			emptyBranchNameRows += 1;
			continue;
		}
		const parsedChildren = parseChildren(branchName, record.children);
		rows.set(branchName, { name: branchName, parent: metadataText(record.parent_branch_name), children: parsedChildren.children, validationResult: metadataText(record.validation_result), childrenCorruption: parsedChildren.corruption });
	}
	return { type: "ok", rows, emptyBranchNameRows };
}

function runSqliteJsonQuery(sqliteRunner: SqliteJsonRunner, dbPath: string, query: string): { type: "ok"; data: unknown } | { type: "failure"; failure: GtCommandFailure } {
	const result = sqliteRunner.run(dbPath, query);
	if (result.error !== undefined && result.error !== null) return { type: "failure", failure: { message: errorCodeFromValue(result.error) === "ENOENT" ? "sqlite3 command not found while reading Graphite metadata" : `Graphite metadata store unreadable: ${errorMessageFromValue(result.error)}`, returnCode: null } };
	if (result.status !== 0) return { type: "failure", failure: { message: result.stderr.trim() || "Graphite metadata store unreadable", returnCode: result.status } };
	try {
		return { type: "ok", data: JSON.parse(result.stdout.trim() || "[]") };
	} catch {
		return { type: "failure", failure: { message: "Graphite metadata sqlite output was not valid JSON", returnCode: null } };
	}
}

function hasExpectedBranchMetadataSchema(value: unknown): boolean {
	if (!Array.isArray(value)) return false;
	const names = new Set<string>();
	for (const row of value) {
		if (isRecord(row) && typeof row.name === "string") names.add(row.name);
	}
	return REQUIRED_BRANCH_METADATA_COLUMNS.every((column) => names.has(column));
}

function metadataRowsFromValue(value: unknown): readonly Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isRecord);
}

function parseChildren(branch: string, value: unknown): { children: readonly string[]; corruption: ChildrenCorruption | null } {
	if (value === null || value === undefined || value === "") return { children: [], corruption: null };
	if (typeof value !== "string") return { children: [], corruption: { branch, kind: "not_text" } };
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return { children: [], corruption: { branch, kind: "invalid_json" } };
	}
	if (!Array.isArray(parsed)) return { children: [], corruption: { branch, kind: "not_list" } };
	const children = parsed.filter((child): child is string => typeof child === "string");
	return { children, corruption: children.length === parsed.length ? null : { branch, kind: "non_string" } };
}

function walkAncestors(rows: ReadonlyMap<string, BranchMetadataRow>, currentBranch: string): { ancestors: readonly string[]; terminusBranch: string; termination: WalkTermination } {
	const reversed: string[] = [];
	let branch = currentBranch;
	const visited = new Set([currentBranch]);
	while (true) {
		const row = rows.get(branch);
		if (row === undefined) return { ancestors: [...reversed].reverse(), terminusBranch: branch, termination: { type: "row_missing", branch } };
		const parent = row.parent;
		if (parent === null) return { ancestors: [...reversed].reverse(), terminusBranch: branch, termination: { type: "completed" } };
		if (visited.has(parent)) return { ancestors: [...reversed].reverse(), terminusBranch: branch, termination: { type: "cycle", branch: parent } };
		reversed.push(parent);
		if (!rows.has(parent)) return { ancestors: [...reversed].reverse(), terminusBranch: parent, termination: { type: "row_missing", branch: parent } };
		visited.add(parent);
		branch = parent;
	}
}

function walkFirstChildDescendants(rows: ReadonlyMap<string, BranchMetadataRow>, currentBranch: string): { descendants: readonly string[]; walk: DescendantWalk } {
	const descendants: string[] = [];
	const forks: StackFork[] = [];
	const childrenCorruptions: ChildrenCorruption[] = [];
	let branch = currentBranch;
	const visited = new Set([currentBranch]);
	while (true) {
		const row = rows.get(branch);
		if (row === undefined) return { descendants, walk: { forks, childrenCorruptions, termination: { type: "row_missing", branch } } };
		if (row.childrenCorruption !== null) childrenCorruptions.push(row.childrenCorruption);
		if (row.children.length > 1) forks.push({ branch, children: row.children });
		const child = row.children[0];
		if (child === undefined) return { descendants, walk: { forks, childrenCorruptions, termination: { type: "completed" } } };
		if (visited.has(child)) return { descendants, walk: { forks, childrenCorruptions, termination: { type: "cycle", branch: child } } };
		descendants.push(child);
		if (!rows.has(child)) return { descendants, walk: { forks, childrenCorruptions, termination: { type: "row_missing", branch: child } } };
		visited.add(child);
		branch = child;
	}
}

function trunkMarkerStatus(rows: ReadonlyMap<string, BranchMetadataRow>, terminus: string): TrunkMarkerStatus {
	const markedTrunks = [...rows.values()].filter((row) => row.validationResult === "TRUNK").map((row) => row.name);
	const terminusRow = rows.get(terminus);
	if (terminusRow === undefined) return { type: "problem", terminus, terminusState: "row_missing", markedTrunks };
	const terminusState = terminusRow.validationResult === "TRUNK" ? "marked" : "unmarked";
	return terminusState === "marked" && markedTrunks.length === 1 && markedTrunks[0] === terminus ? { type: "clean" } : { type: "problem", terminus, terminusState, markedTrunks };
}

function metadataText(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCodeFromValue(value: unknown): string | undefined {
	return isRecord(value) && typeof value.code === "string" ? value.code : undefined;
}

function errorMessageFromValue(value: unknown): string {
	return isRecord(value) && typeof value.message === "string" ? value.message : String(value);
}

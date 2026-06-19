import { existsSync } from "node:fs";

import {
	classifySqliteJsonResult,
	createGraphiteSqliteJsonRunner,
	GRAPHITE_BRANCH_METADATA_QUERY,
	GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY,
	graphiteMetadataDbPath,
	graphiteTrunkMarkerStatus,
	hasExpectedGraphiteBranchMetadataSchema,
	parseGraphiteBranchMetadataRows,
	walkFirstChildGraphiteDescendants,
	walkGraphiteAncestors,
	type GraphiteChildrenCorruption,
	type GraphiteChildrenCorruptionKind,
	type GraphiteFork,
	type GraphiteTopologyParseDiagnostics,
	type GraphiteTrunkMarkerStatus,
	type GraphiteTopology,
	type GraphiteWalkTermination,
	type SqliteJsonRunner,
} from "@asdl/core/graphite-metadata";
import { isRecord } from "@asdl/core/primitives";
import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";

import type { SlotGitGateway } from "./git.ts";

const SLOT_GT_TIMEOUT_MS = 10_000;

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

export type StackGraphResult =
	| { type: "graph"; graph: StackGraphInfo }
	| { type: "git_common_dir_missing"; message: string }
	| { type: "failure"; failure: GtCommandFailure };

export type WalkTermination = GraphiteWalkTermination;
export type ChildrenCorruptionKind = GraphiteChildrenCorruptionKind;
export type ChildrenCorruption = GraphiteChildrenCorruption;
export type StackFork = GraphiteFork;

export interface DescendantWalk {
	forks: readonly StackFork[];
	childrenCorruptions: readonly ChildrenCorruption[];
	termination: WalkTermination;
}

export type TrunkMarkerStatus = GraphiteTrunkMarkerStatus;

export interface StackInfo {
	trunk: string;
	current: string;
	ancestors: readonly string[];
	descendants: readonly string[];
	ancestorTermination: WalkTermination;
	descendantWalk: DescendantWalk;
	trunkMarker: TrunkMarkerStatus;
}

export interface StackGraphInfo {
	topology: GraphiteTopology;
	diagnostics: GraphiteTopologyParseDiagnostics;
}

export interface SlotGtGateway {
	parentOf(cwd: string): Promise<ParentOfResult>;
	childrenOf(cwd: string): Promise<ChildrenOfResult>;
	trunk(cwd: string): Promise<TrunkResult>;
	stack(cwd: string): Promise<StackResult>;
	stackGraph(cwd: string): Promise<StackGraphResult>;
}

export type GraphiteMetadataJsonQueryResult =
	| { type: "success"; data: unknown }
	| { type: "failure"; failure: GtCommandFailure };

export interface GraphiteMetadataDbAccess {
	exists(dbPath: string): boolean;
	queryJson(dbPath: string, query: string): GraphiteMetadataJsonQueryResult;
}

export class RealSlotGtGateway implements SlotGtGateway {
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;
	private readonly git: SlotGitGateway;
	private readonly metadataDbAccess: GraphiteMetadataDbAccess;

	constructor(options: {
		git: SlotGitGateway;
		env?: NodeJS.ProcessEnv | undefined;
		execApi?: CommandExecApi | undefined;
		metadataDbAccess?: GraphiteMetadataDbAccess | undefined;
	}) {
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
		this.git = options.git;
		this.metadataDbAccess = options.metadataDbAccess ?? new RealGraphiteMetadataDbAccess();
	}

	async parentOf(cwd: string): Promise<ParentOfResult> {
		const result = await this.run("gt", ["parent", "--no-interactive"], cwd);
		if (!result.isOk) {
			const failure = failureFromCommandResult(result);
			if (failure.message.toLowerCase().includes("untracked branch"))
				return { type: "untracked_branch", message: failure.message };
			return { type: "failure", failure };
		}
		const branch = firstNonemptyLine(result.stdout);
		return branch === null ? { type: "no_parent" } : { type: "parent", branch };
	}

	async childrenOf(cwd: string): Promise<ChildrenOfResult> {
		const result = await this.run("gt", ["children", "--no-interactive"], cwd);
		if (!result.isOk) {
			const failure = failureFromCommandResult(result);
			if (failure.message.toLowerCase().includes("untracked branch"))
				return { type: "untracked_branch", message: failure.message };
			return { type: "failure", failure };
		}
		return { type: "children", branches: nonemptyLines(result.stdout) };
	}

	async trunk(cwd: string): Promise<TrunkResult> {
		const result = await this.run("gt", ["trunk", "--no-interactive"], cwd);
		if (!result.isOk) return { type: "failure", failure: failureFromCommandResult(result) };
		const branch = firstNonemptyLine(result.stdout);
		if (branch === null)
			return {
				type: "failure",
				failure: { message: "gt trunk returned no branch", returnCode: null },
			};
		return { type: "trunk", branch };
	}

	async stack(cwd: string): Promise<StackResult> {
		const commonDir = await this.git.getGitCommonDir(cwd);
		if (commonDir === null)
			return {
				type: "failure",
				failure: {
					message: "Failed to resolve git common dir for Graphite metadata",
					returnCode: null,
				},
			};
		const current = await this.resolveCurrentBranch(cwd);
		if (current.type === "failure") return { type: "failure", failure: current.failure };
		if (current.type === "detached")
			return {
				type: "failure",
				failure: {
					message: `HEAD at ${cwd} is detached. Check out a branch first.`,
					returnCode: null,
				},
			};
		return readStackFromMetadataDb(
			graphiteMetadataDbPath(commonDir),
			current.branch,
			this.metadataDbAccess,
		);
	}

	async stackGraph(cwd: string): Promise<StackGraphResult> {
		const commonDir = await this.git.getGitCommonDir(cwd);
		if (commonDir === null)
			return {
				type: "git_common_dir_missing",
				message: "Could not resolve Git common dir for Graphite metadata.",
			};
		const dbPath = graphiteMetadataDbPath(commonDir);
		if (!this.metadataDbAccess.exists(dbPath))
			return {
				type: "failure",
				failure: { message: `Graphite metadata store not found at ${dbPath}`, returnCode: null },
			};
		const loaded = loadBranchMetadata(dbPath, this.metadataDbAccess);
		if (loaded.type === "failure") return loaded;
		return { type: "graph", graph: { topology: loaded.topology, diagnostics: loaded.diagnostics } };
	}

	private async resolveCurrentBranch(
		cwd: string,
	): Promise<
		| { type: "branch"; branch: string }
		| { type: "detached" }
		| { type: "failure"; failure: GtCommandFailure }
	> {
		const result = await this.git.getCurrentBranch(cwd);
		if (result.type === "branch") return result;
		if (result.type === "detached") return result;
		return { type: "failure", failure: { message: result.failure.message, returnCode: null } };
	}

	private async run(command: string, args: readonly string[], cwd: string): Promise<CommandResult> {
		const result = await this.execApi.exec(command, [...args], {
			cwd,
			env: this.env,
			timeout: SLOT_GT_TIMEOUT_MS,
		});
		return {
			isOk: result.code === 0 && !result.killed,
			stdout: result.stdout,
			stderr: result.stderr,
			code: result.code,
			killed: result.killed,
		};
	}
}

interface CommandResult {
	isOk: boolean;
	stdout: string;
	stderr: string;
	code: number | null;
	killed: boolean;
}

function failureFromCommandResult(result: CommandResult): GtCommandFailure {
	const output =
		result.stderr.trim() ||
		result.stdout.trim() ||
		(result.killed ? "command was killed" : "command failed");
	return { message: output, returnCode: result.code };
}

function firstNonemptyLine(text: string): string | null {
	return nonemptyLines(text)[0] ?? null;
}

function nonemptyLines(text: string): readonly string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

class RealGraphiteMetadataDbAccess implements GraphiteMetadataDbAccess {
	private readonly sqliteRunner: SqliteJsonRunner;

	constructor(sqliteRunner: SqliteJsonRunner = createGraphiteSqliteJsonRunner()) {
		this.sqliteRunner = sqliteRunner;
	}

	exists(dbPath: string): boolean {
		return existsSync(dbPath);
	}

	queryJson(dbPath: string, query: string): GraphiteMetadataJsonQueryResult {
		return runSqliteJsonQuery(this.sqliteRunner, dbPath, query);
	}
}

function readStackFromMetadataDb(
	dbPath: string,
	currentBranch: string,
	metadataDbAccess: GraphiteMetadataDbAccess,
): StackResult {
	if (!metadataDbAccess.exists(dbPath))
		return {
			type: "failure",
			failure: { message: `Graphite metadata store not found at ${dbPath}`, returnCode: null },
		};
	const loaded = loadBranchMetadata(dbPath, metadataDbAccess);
	if (loaded.type === "failure") return { type: "failure", failure: loaded.failure };
	const row = loaded.topology.get(currentBranch);
	if (row === undefined)
		return {
			type: "untracked_branch",
			message: `current branch is not tracked by Graphite: ${currentBranch}`,
		};
	const ancestors = walkGraphiteAncestors(loaded.topology, currentBranch);
	const descendantWalk = walkFirstChildGraphiteDescendants(loaded.topology, currentBranch);
	const trunkMarker = graphiteTrunkMarkerStatus(loaded.topology, ancestors.terminusBranch);
	return {
		type: "stack",
		stack: {
			trunk: ancestors.ancestors[0] ?? currentBranch,
			current: currentBranch,
			ancestors: ancestors.ancestors,
			descendants: descendantWalk.descendants,
			ancestorTermination: ancestors.termination,
			descendantWalk: {
				forks: descendantWalk.forks,
				childrenCorruptions: descendantWalk.childrenCorruptions,
				termination: descendantWalk.termination,
			},
			trunkMarker,
		},
	};
}

function loadBranchMetadata(
	dbPath: string,
	metadataDbAccess: GraphiteMetadataDbAccess,
):
	| { type: "ok"; topology: GraphiteTopology; diagnostics: GraphiteTopologyParseDiagnostics }
	| { type: "failure"; failure: GtCommandFailure } {
	const schemaRows = metadataDbAccess.queryJson(dbPath, GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY);
	if (schemaRows.type === "failure") return schemaRows;
	if (!hasExpectedGraphiteBranchMetadataSchema(schemaRows.data))
		return {
			type: "failure",
			failure: {
				message: "Graphite metadata schema mismatch: branch_metadata missing required column",
				returnCode: null,
			},
		};
	const result = metadataDbAccess.queryJson(dbPath, GRAPHITE_BRANCH_METADATA_QUERY);
	if (result.type === "failure") return result;
	const parsed = parseGraphiteBranchMetadataRows(result.data);
	if (parsed.type === "not_array")
		return {
			type: "failure",
			failure: { message: "Graphite metadata sqlite output was not an array", returnCode: null },
		};
	return { type: "ok", topology: parsed.topology, diagnostics: parsed.diagnostics };
}

function runSqliteJsonQuery(
	sqliteRunner: SqliteJsonRunner,
	dbPath: string,
	query: string,
): GraphiteMetadataJsonQueryResult {
	const outcome = classifySqliteJsonResult(sqliteRunner.run(dbPath, query));
	switch (outcome.type) {
		case "success":
			return { type: "success", data: outcome.data };
		case "command-missing":
			return {
				type: "failure",
				failure: {
					message: "sqlite3 command not found while reading Graphite metadata",
					returnCode: null,
				},
			};
		case "exec-error":
			return {
				type: "failure",
				failure: {
					message: `Graphite metadata store unreadable: ${errorMessageFromValue(outcome.error)}`,
					returnCode: null,
				},
			};
		case "nonzero-exit":
			return {
				type: "failure",
				failure: {
					message: outcome.stderr.trim() || "Graphite metadata store unreadable",
					returnCode: outcome.status,
				},
			};
		case "invalid-json":
			return {
				type: "failure",
				failure: {
					message: "Graphite metadata sqlite output was not valid JSON",
					returnCode: null,
				},
			};
	}
}

function errorMessageFromValue(value: unknown): string {
	return isRecord(value) && typeof value.message === "string" ? value.message : String(value);
}

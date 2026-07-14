import {
	createGraphiteMetadataDbAccess,
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
	type GraphiteMetadataDbAccess,
	type GraphiteTopology,
	type GraphiteWalkTermination,
	type SqliteJsonError,
} from "./metadata.ts";
import { isAbsolute, resolve } from "node:path";

import {
	commandFailureReason,
	commandSucceeded,
	NodeCommandExecApi,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { isRecord, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";

const GRAPHITE_STACK_COMMAND_TIMEOUT_MS = 10_000;

/**
 * Resolve the Git common dir (`git rev-parse --git-common-dir`) through the exec
 * seam, returning an absolute path or `null` when the probe fails or is empty. A
 * relative result is resolved against `cwd` so callers get an absolute path.
 */
export async function execGitCommonDir(
	execApi: CommandExecApi,
	cwd: string,
): Promise<string | null> {
	const result = await execApi.exec("git", ["rev-parse", "--git-common-dir"], { cwd });
	if (!commandSucceeded(result)) return null;
	const raw = result.stdout.trim();
	if (raw.length === 0) return null;
	return isAbsolute(raw) ? raw : resolve(cwd, raw);
}

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

export type GraphiteStackPathFailure =
	| { type: "untracked_branch"; message: string }
	| { type: "provider_failure"; failure: GtCommandFailure }
	| { type: "ancestor_cycle"; branch: string }
	| { type: "ancestor_row_missing"; branch: string }
	| {
			type: "trunk_marker_problem";
			marker: Extract<TrunkMarkerStatus, { type: "problem" }>;
	  }
	| { type: "path_inconsistent"; trunk: string; current: string };

export type ValidatedGraphiteStackPathResult =
	| { type: "success"; stack: StackInfo; path: readonly string[] }
	| { type: "failure"; failure: GraphiteStackPathFailure };

/** Validate neutral Graphite ancestry facts and derive the inclusive trunk-to-current path. */
export function deriveValidatedGraphiteStackPath(
	result: StackResult,
): ValidatedGraphiteStackPathResult {
	if (result.type === "untracked_branch") {
		return { type: "failure", failure: { type: "untracked_branch", message: result.message } };
	}
	if (result.type === "failure") {
		return { type: "failure", failure: { type: "provider_failure", failure: result.failure } };
	}

	const { stack } = result;
	if (stack.ancestorTermination.type === "cycle") {
		return {
			type: "failure",
			failure: { type: "ancestor_cycle", branch: stack.ancestorTermination.branch },
		};
	}
	if (stack.ancestorTermination.type === "row_missing") {
		return {
			type: "failure",
			failure: { type: "ancestor_row_missing", branch: stack.ancestorTermination.branch },
		};
	}
	if (stack.trunkMarker.type === "problem") {
		return {
			type: "failure",
			failure: { type: "trunk_marker_problem", marker: stack.trunkMarker },
		};
	}

	const path = [...stack.ancestors, stack.current];
	if (
		stack.trunk.trim() === "" ||
		stack.current.trim() === "" ||
		path.length === 0 ||
		path[0] !== stack.trunk ||
		path.some((branch) => branch.trim() === "") ||
		new Set(path).size !== path.length
	) {
		return {
			type: "failure",
			failure: { type: "path_inconsistent", trunk: stack.trunk, current: stack.current },
		};
	}

	return { type: "success", stack, path };
}

export interface StackGraphInfo {
	topology: GraphiteTopology;
	diagnostics: GraphiteTopologyParseDiagnostics;
}

export interface GraphiteStackGateway {
	parentOf(cwd: string): Promise<ParentOfResult>;
	childrenOf(cwd: string): Promise<ChildrenOfResult>;
	trunk(cwd: string): Promise<TrunkResult>;
	stack(cwd: string): Promise<StackResult>;
	stackGraph(cwd: string): Promise<StackGraphResult>;
}

export interface GraphiteStackGitGateway {
	getGitCommonDir(cwd: string): Promise<string | null>;
	getCurrentBranch(
		cwd: string,
	): Promise<
		| { type: "branch"; branch: string }
		| { type: "detached" }
		| { type: "failure"; failure: { message: string } }
	>;
}

export class RealGraphiteStackGateway implements GraphiteStackGateway {
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;
	private readonly git: GraphiteStackGitGateway;
	private readonly metadataDbAccess: GraphiteMetadataDbAccess;

	constructor(options: {
		git: GraphiteStackGitGateway;
		env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
		execApi?: CommandExecApi;
		metadataDbAccess?: GraphiteMetadataDbAccess;
	}) {
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
		this.git = options.git;
		this.metadataDbAccess = options.metadataDbAccess ?? createGraphiteMetadataDbAccess();
	}

	async parentOf(cwd: string): Promise<ParentOfResult> {
		const result = await this.run("gt", ["parent", "--no-interactive"], cwd);
		if (!result.isOk) {
			const failure = failureFromCommandResult(result);
			if (failure.message.toLowerCase().includes("untracked branch"))
				return { type: "untracked_branch", message: failure.message };
			return { type: "failure", failure };
		}
		const branch = firstNonemptyLine(result.result.stdout);
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
		return { type: "children", branches: nonemptyLines(result.result.stdout) };
	}

	async trunk(cwd: string): Promise<TrunkResult> {
		const result = await this.run("gt", ["trunk", "--no-interactive"], cwd);
		if (!result.isOk) return { type: "failure", failure: failureFromCommandResult(result) };
		const branch = firstNonemptyLine(result.result.stdout);
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
			timeout: GRAPHITE_STACK_COMMAND_TIMEOUT_MS,
		});
		return { isOk: commandSucceeded(result), result };
	}
}

interface CommandResult {
	isOk: boolean;
	result: ExecResult;
}

function failureFromCommandResult(run: CommandResult): GtCommandFailure {
	const stderr = run.result.stderr.trim();
	const returnCode =
		run.result.type === "exited" && run.result.signal === null ? run.result.code : null;
	if (stderr !== "") return { message: stderr, returnCode };
	const stdout = run.result.stdout.trim();
	if (stdout !== "") return { message: stdout, returnCode };
	return { message: commandFailureReason(run.result), returnCode };
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
	if (!schemaRows.ok)
		return { type: "failure", failure: stackFailureFromSqliteError(schemaRows.error) };
	if (!hasExpectedGraphiteBranchMetadataSchema(schemaRows.value))
		return {
			type: "failure",
			failure: {
				message: "Graphite metadata schema mismatch: branch_metadata missing required column",
				returnCode: null,
			},
		};
	const result = metadataDbAccess.queryJson(dbPath, GRAPHITE_BRANCH_METADATA_QUERY);
	if (!result.ok) return { type: "failure", failure: stackFailureFromSqliteError(result.error) };
	const parsed = parseGraphiteBranchMetadataRows(result.value);
	if (parsed.type === "not_array")
		return {
			type: "failure",
			failure: { message: "Graphite metadata sqlite output was not an array", returnCode: null },
		};
	return { type: "ok", topology: parsed.topology, diagnostics: parsed.diagnostics };
}

function stackFailureFromSqliteError(error: SqliteJsonError): GtCommandFailure {
	switch (error.type) {
		case "command-missing":
			return {
				message: "sqlite3 command not found while reading Graphite metadata",
				returnCode: null,
			};
		case "exec-error":
			return {
				message: `Graphite metadata store unreadable: ${errorMessageFromValue(error.error)}`,
				returnCode: null,
			};
		case "nonzero-exit": {
			const stderr = error.stderr.trim();
			return {
				message: stderr === "" ? "Graphite metadata store unreadable" : stderr,
				returnCode: error.status,
			};
		}
		case "invalid-json":
			return {
				message: "Graphite metadata sqlite output was not valid JSON",
				returnCode: null,
			};
	}
}

function errorMessageFromValue(value: unknown): string {
	return isRecord(value) && typeof value.message === "string" ? value.message : String(value);
}

import {
	createGraphiteMetadataDbAccess,
	filterLiveBranchNames,
	GRAPHITE_BRANCH_METADATA_QUERY,
	GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY,
	graphiteMetadataDbPath,
	hasExpectedGraphiteBranchMetadataSchema,
	parseGraphiteBranchMetadataRows,
	sqliteTextLiteral,
	type SqliteJsonError,
} from "./metadata.ts";
import { readLocalBranchRefs } from "../git/local-ref-reader.ts";
import type {
	GraphiteBranchAccess,
	GraphiteMetadataLookupInput,
	GraphiteMetadataStatus,
	GraphiteMetadataUnavailableReason,
	LoadGraphiteMetadataStatusOptions,
} from "./status.ts";

const defaultGraphiteMetadataDbAccess = createGraphiteMetadataDbAccess();

const defaultGraphiteBranchAccess: GraphiteBranchAccess = {
	listLocalBranches(commonGitDir) {
		return readLocalBranchRefs(commonGitDir);
	},
};

export function loadGraphiteMetadataStatus(
	input: GraphiteMetadataLookupInput,
	options: LoadGraphiteMetadataStatusOptions = {},
): GraphiteMetadataStatus {
	const dbAccess = options.dbAccess ?? defaultGraphiteMetadataDbAccess;
	const dbPath = graphiteMetadataDbPath(input.commonGitDir);
	if (!dbAccess.exists(dbPath))
		return { type: "unavailable", reason: "missing-db", currentBranch: input.currentBranch };

	const schemaRows = dbAccess.queryJson(dbPath, GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY);
	if (!schemaRows.ok) {
		return {
			type: "unavailable",
			reason: statusReasonFromSqliteError(schemaRows.error),
			currentBranch: input.currentBranch,
		};
	}
	if (!hasExpectedGraphiteBranchMetadataSchema(schemaRows.value)) {
		return { type: "unavailable", reason: "schema-mismatch", currentBranch: input.currentBranch };
	}

	const rowQuery = [
		GRAPHITE_BRANCH_METADATA_QUERY,
		`WHERE branch_name = ${sqliteTextLiteral(input.currentBranch)}`,
		"LIMIT 1",
	].join(" ");
	const rowResult = dbAccess.queryJson(dbPath, rowQuery);
	if (!rowResult.ok) {
		return {
			type: "unavailable",
			reason: statusReasonFromSqliteError(rowResult.error),
			currentBranch: input.currentBranch,
		};
	}

	const parsed = parseGraphiteBranchMetadataRows(rowResult.value);
	if (parsed.type !== "ok")
		return { type: "unavailable", reason: "read-failed", currentBranch: input.currentBranch };
	const row = parsed.topology.get(input.currentBranch);
	if (row === undefined) return { type: "untracked", currentBranch: input.currentBranch };

	// Reconcile children against live local refs so the "up" branch matches gt,
	// which silently drops children whose refs/heads/<name> no longer exists. If
	// the passive filesystem scan cannot prove the live set, fail closed rather
	// than turning unknown refs into definitely missing refs.
	const branchAccess = options.branchAccess ?? defaultGraphiteBranchAccess;
	const liveBranches = branchAccess.listLocalBranches(input.commonGitDir);
	if (!liveBranches.ok) {
		return {
			type: "unavailable",
			reason: "branch-ref-read-failed",
			currentBranch: input.currentBranch,
		};
	}
	const children = filterLiveBranchNames(row.children, liveBranches.branches).kept;

	return {
		type: "tracked",
		currentBranch: input.currentBranch,
		parent: row.parent,
		children,
		isCurrentTrunk: row.isTrunkMarked,
	};
}

function statusReasonFromSqliteError(
	error: SqliteJsonError,
): Extract<GraphiteMetadataUnavailableReason, "sqlite-unavailable" | "read-failed"> {
	switch (error.type) {
		case "command-missing":
			return "sqlite-unavailable";
		case "exec-error":
		case "nonzero-exit":
		case "invalid-json":
			return "read-failed";
	}
}

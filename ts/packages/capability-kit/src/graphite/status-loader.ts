import {
	createGraphiteMetadataDbAccess,
	filterLiveBranchNames,
	GRAPHITE_BRANCH_METADATA_QUERY,
	GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY,
	graphiteMetadataDbPath,
	hasExpectedGraphiteBranchMetadataSchema,
	parseGraphiteBranchMetadataRows,
	walkGraphiteAncestors,
	type GraphiteTopology,
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

	// Load the full branch table (not just the current row) so stack depth can be
	// counted; the Graphite metadata table stays small (one row per branch).
	const rowResult = dbAccess.queryJson(dbPath, GRAPHITE_BRANCH_METADATA_QUERY);
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
	const downstackCount = downstackCountFromTopology(parsed.topology, input.currentBranch);

	return {
		type: "tracked",
		currentBranch: input.currentBranch,
		parent: row.parent,
		children,
		isCurrentTrunk: row.isTrunkMarked,
		...(downstackCount === undefined ? {} : { downstackCount }),
		upstackCount: upstackCountFromTopology(
			parsed.topology,
			input.currentBranch,
			liveBranches.branches,
		),
	};
}

function downstackCountFromTopology(
	topology: GraphiteTopology,
	currentBranch: string,
): number | undefined {
	const walk = walkGraphiteAncestors(topology, currentBranch);
	if (walk.termination.type !== "completed") return undefined;
	return walk.ancestors.filter((ancestor) => topology.get(ancestor)?.isTrunkMarked !== true).length;
}

function upstackCountFromTopology(
	topology: GraphiteTopology,
	currentBranch: string,
	liveBranches: ReadonlySet<string>,
): number {
	// Count distinct branches reachable through live-ref children (matching the
	// immediate-children reconciliation above). Real metadata tables carry stale
	// diamond links and can even cycle, so a visited set — not walkGraphiteSubtree's
	// revisit-is-corruption contract — is the right traversal here.
	const visited = new Set([currentBranch]);
	const pending = [currentBranch];
	for (let branch = pending.pop(); branch !== undefined; branch = pending.pop()) {
		const row = topology.get(branch);
		if (row === undefined) continue;
		for (const child of filterLiveBranchNames(row.children, liveBranches).kept) {
			if (visited.has(child)) continue;
			visited.add(child);
			pending.push(child);
		}
	}
	return visited.size - 1;
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

import { GRAPHITE_BRANCH_METADATA_QUERY } from "@asdl/core/graphite-metadata";

export const TOPOLOGY_QUERY = GRAPHITE_BRANCH_METADATA_QUERY;

export function topologyArgs(dbPath: string): string[] {
	return ["-readonly", "-json", dbPath, TOPOLOGY_QUERY];
}

export function metadataDbJson(rows: Array<{ branch: string; parent?: string; children?: string[]; trunk?: boolean }>): string {
	return JSON.stringify(
		rows.map((row) => ({
			branch_name: row.branch,
			parent_branch_name: row.parent ?? null,
			children: row.children ? JSON.stringify(row.children) : null,
			validation_result: row.trunk ? "TRUNK" : "VALID",
		})),
	);
}

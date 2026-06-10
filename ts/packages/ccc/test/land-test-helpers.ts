export const TOPOLOGY_QUERY = "SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata";

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

import { GRAPHITE_BRANCH_METADATA_QUERY } from "@sdl/capability-kit/graphite/metadata";

export const TOPOLOGY_QUERY = GRAPHITE_BRANCH_METADATA_QUERY;
export const TOPOLOGY_COMMAND = "ji";

import { readGraphiteBranchMetadataCommand } from "../../src/land/stack/graphite-command-channel.ts";

export function topologyArgs(dbPath: string): string[] {
	return readGraphiteBranchMetadataCommand(dbPath).args;
}

export function metadataDbJson(
	rows: Array<{ branch: string; parent?: string; children?: string[]; trunk?: boolean }>,
): string {
	return JSON.stringify(
		rows.map((row) => ({
			branch_name: row.branch,
			parent_branch_name: row.parent ?? null,
			children: row.children ? JSON.stringify(row.children) : null,
			validation_result: row.trunk ? "TRUNK" : "VALID",
		})),
	);
}

export function formatLiveBranchTips(branches: readonly string[]): string {
	if (branches.length === 0) return "";
	return `${branches.map(formatLiveBranchTip).join("\n")}\n`;
}

export function formatLiveBranchTip(branch: string): string {
	if (branch.includes("\t")) return branch;
	return `${branch}\t${"0".repeat(40)}\t2026-01-01T00:00:00Z`;
}

import { GRAPHITE_BRANCH_METADATA_QUERY } from "@ns/capability-kit/graphite/metadata";

export const TOPOLOGY_QUERY = GRAPHITE_BRANCH_METADATA_QUERY;
export const TOPOLOGY_COMMAND = "ns";

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

export interface FormatLiveBranchTipsOptions {
	readonly shaOverrides?: Readonly<Record<string, string>>;
	readonly shaForBranch?: (branch: string) => string | undefined;
	readonly defaultSha?: string;
}

export function formatLiveBranchTips(
	branches: readonly string[],
	options: FormatLiveBranchTipsOptions = {},
): string {
	if (branches.length === 0) return "";
	return `${branches.map((branch) => formatLiveBranchTip(branch, options)).join("\n")}\n`;
}

export function formatLiveBranchTip(
	branch: string,
	options: FormatLiveBranchTipsOptions = {},
): string {
	if (branch.includes("\t")) return branch;
	const sha =
		options.shaOverrides?.[branch] ??
		options.shaForBranch?.(branch) ??
		options.defaultSha ??
		"0".repeat(40);
	return `${branch}\t${sha}\t2026-01-01T00:00:00Z`;
}

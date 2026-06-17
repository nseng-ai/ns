import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../../context.ts";
import { getSlotGtGateway } from "../../../gateways/gt.ts";
import { renderGraphWarnings, renderStackWarnings, rowsByName, branchNeedsRestack, type BranchMetadataGraph, type BranchMetadataGraphRow, type StackInfo } from "../../../gt/types.ts";
import { buildSlotInventory } from "../../../inventory.ts";

export const stackMapBranchesRequestSchema = z.object({ recent_limit: z.number().int().min(0).default(40) });
export const stackMapBranchesResultSchema = z.object({
	current: z.string(),
	trunk: z.string(),
	scope: z.literal("stack-map"),
	recent_limit: z.number().int().nonnegative(),
	branches: z.array(z.object({ name: z.string(), parent: z.string().nullable(), children: z.array(z.string()), validation_result: z.string().nullable(), needs_restack: z.boolean() })),
	edges: z.array(z.object({ parent: z.string(), child: z.string() })),
	slots: z.array(z.object({ slot_name: z.string(), branch: z.string(), worktree_path: z.string(), status: z.literal("assigned") })),
	warnings: z.array(z.string()),
});

export type StackMapBranchesRequest = z.infer<typeof stackMapBranchesRequestSchema>;
export type StackMapBranchesResult = z.infer<typeof stackMapBranchesResultSchema>;
type SlotRow = StackMapBranchesResult["slots"][number];

export async function runStackMapBranches(ctx: SlotCliContext, request: StackMapBranchesRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const current = await ctx.git.getCurrentBranch(ctx.repo.root);
	if (current.type === "failure") return failure("git_current_branch_failed", current.failure.message);
	if (current.type === "detached") return failure("detached_head", `HEAD at ${ctx.repo.root} is detached. Check out a branch first.`);
	const gt = getSlotGtGateway(ctx);
	const stackResult = await gt.stack(ctx.repo.root);
	if (stackResult.type === "untracked_branch") return failure("untracked_branch", `${stackResult.message} — run \`gt track\` first`);
	if (stackResult.type === "failure") return failure("gt_stack_read_failed", stackResult.failure.message);
	const gitCommonDir = await ctx.git.getGitCommonDir(ctx.repo.root);
	if (gitCommonDir === null) return failure("git_common_dir_missing", "Could not resolve Git common dir for Graphite metadata.");
	const graphResult = await gt.metadataGraph(ctx.repo.root);
	if (graphResult.type === "failure") return failure("gt_metadata_read_failed", graphResult.failure.message);
	const graphByName = rowsByName(graphResult.graph);
	if (!graphByName.has(stackResult.stack.trunk)) return failure("stack_metadata_inconsistent", `Graphite trunk branch ${stackResult.stack.trunk} is missing from metadata graph.`);
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	const slotRows = inventory.records.flatMap((record): SlotRow[] => record.branch === null ? [] : [{ slot_name: record.slotName, branch: record.branch, worktree_path: record.path, status: "assigned" }]);
	const recent = recentBranchNames(await ctx.git.listLocalBranchTips(), request.recent_limit);
	const selected = selectVisibleBranches({ graphByName, stack: stackResult.stack, slotRows, recentBranches: recent, localBranches: new Set(await ctx.git.listLocalBranches()) });
	const warnings = dedupeWarnings([...renderGraphWarnings(graphResult.graph), ...renderStackWarnings(stackResult.stack), ...selected.warnings]);
	return ok({ current: stackResult.stack.current, trunk: stackResult.stack.trunk, scope: "stack-map" as const, recent_limit: request.recent_limit, branches: branchResults(graphResult.graph, selected.selected), edges: edgeResults(graphByName, selected.selected), slots: slotRows, warnings });
}

export function renderStackMapBranches(result: StackMapBranchesResult): string {
	for (const warning of result.warnings) console.error(warning);
	return JSON.stringify({ branches: result.branches.map((branch) => branch.name) });
}

function recentBranchNames(branchTips: readonly { name: string; head_iso: string | null }[], recentLimit: number): readonly string[] {
	return [...branchTips].sort((left, right) => {
		const leftKey = `${left.head_iso === null ? "0" : "1"}${left.head_iso ?? ""}`;
		const rightKey = `${right.head_iso === null ? "0" : "1"}${right.head_iso ?? ""}`;
		return rightKey.localeCompare(leftKey);
	}).slice(0, recentLimit).map((tip) => tip.name);
}

function selectVisibleBranches(options: { graphByName: Map<string, BranchMetadataGraphRow>; stack: StackInfo; slotRows: readonly SlotRow[]; recentBranches: readonly string[]; localBranches: ReadonlySet<string> }): { selected: Set<string>; warnings: readonly string[] } {
	const selected = new Set([options.stack.trunk, options.stack.current, ...options.stack.ancestors, ...options.stack.children, ...options.stack.descendants]);
	const warnings: string[] = [];
	for (const slot of options.slotRows) {
		if (options.graphByName.has(slot.branch)) selected.add(slot.branch);
		else warnings.push(`assigned slot branch ${slot.branch} is missing from Graphite metadata; skipped`);
	}
	for (const branch of options.recentBranches) if (options.graphByName.has(branch)) selected.add(branch);
	for (const branch of [...selected]) {
		if (!options.graphByName.has(branch)) continue;
		addAncestors(branch, selected, options.graphByName, warnings);
		addDescendants(branch, selected, options.graphByName, warnings);
	}
	return { selected: new Set([...selected].filter((branch) => options.graphByName.has(branch) && options.localBranches.has(branch))), warnings };
}

function addAncestors(branch: string, selected: Set<string>, graphByName: Map<string, BranchMetadataGraphRow>, warnings: string[]): void {
	const visited = new Set<string>();
	let cursor: string | null = branch;
	while (cursor !== null) {
		if (visited.has(cursor)) { warnings.push(`cycle detected in Graphite parent metadata at ${cursor}; ancestor selection stopped`); return; }
		visited.add(cursor);
		const row = graphByName.get(cursor);
		if (row === undefined) { warnings.push(`parent branch ${cursor} is missing from Graphite metadata; ancestor selection stopped`); return; }
		selected.add(cursor);
		cursor = row.parent;
	}
}

function addDescendants(branch: string, selected: Set<string>, graphByName: Map<string, BranchMetadataGraphRow>, warnings: string[]): void {
	const pending = [...(graphByName.get(branch)?.children ?? [])];
	const visited = new Set([branch]);
	while (pending.length > 0) {
		const child = pending.pop() ?? "";
		if (visited.has(child)) { warnings.push(`cycle detected in Graphite children metadata at ${child}; descendant selection stopped`); continue; }
		visited.add(child);
		const row = graphByName.get(child);
		if (row === undefined) { warnings.push(`child branch ${child} is missing from Graphite metadata; descendant selection stopped`); continue; }
		selected.add(child);
		pending.push(...row.children);
	}
}

function branchResults(graph: BranchMetadataGraph, selected: ReadonlySet<string>): StackMapBranchesResult["branches"] {
	return graph.rows.filter((row) => selected.has(row.name)).map((row) => ({ name: row.name, parent: row.parent, children: row.children.filter((child) => selected.has(child)), validation_result: row.validation_result, needs_restack: branchNeedsRestack(row) }));
}

function edgeResults(graphByName: Map<string, BranchMetadataGraphRow>, selected: ReadonlySet<string>): StackMapBranchesResult["edges"] {
	const edges: StackMapBranchesResult["edges"] = [];
	for (const branch of [...selected].sort()) {
		const row = graphByName.get(branch);
		if (row?.parent !== undefined && row.parent !== null && selected.has(row.parent)) edges.push({ parent: row.parent, child: row.name });
	}
	return edges;
}

function dedupeWarnings(warnings: readonly string[]): string[] {
	const seen = new Set<string>();
	return warnings.filter((warning) => {
		if (seen.has(warning)) return false;
		seen.add(warning);
		return true;
	});
}

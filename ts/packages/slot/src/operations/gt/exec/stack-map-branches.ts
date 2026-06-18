import { failure, ok } from "@asdl/clinkr";
import { walkGraphiteAncestors, type GraphiteBranchTopology, type GraphiteTopology, type GraphiteTopologyParseDiagnostics } from "@asdl/core/graphite-metadata";
import { z } from "zod";

import { deduplicateOrderedStrings } from "../../../collections.ts";
import type { SlotCliContext } from "../../../context.ts";
import type { LocalBranchTip } from "../../../gateways/git.ts";
import type { StackInfo } from "../../../gateways/gt.ts";
import { buildSlotInventory, type SlotRecord } from "../../../inventory.ts";
import { resolveRepoAndCurrentBranch } from "../shared.ts";
import { renderChildrenCorruption, renderTrunkMarkerWarnings, renderWalkTerminationWarning } from "./metadata-warnings.ts";

const STACK_MAP_SCOPE = "stack-map";
const BAD_PARENT_NAME_VALIDATION_RESULT = "BAD_PARENT_NAME";
const EMPTY_BRANCH_NAME_WARNING = "Graphite metadata row has an empty branch_name; row ignored";

const stackMapBranchSchema = z.object({
	name: z.string(),
	parent: z.string().nullable(),
	children: z.array(z.string()),
	validation_result: z.string().nullable(),
	needs_restack: z.boolean(),
});

const stackMapEdgeSchema = z.object({ parent: z.string(), child: z.string() });

const stackMapSlotSchema = z.object({
	slot_name: z.string(),
	branch: z.string(),
	worktree_path: z.string(),
	status: z.literal("assigned"),
});

export const gtStackMapBranchesRequestSchema = z.object({
	recent_limit: z.number().int().nonnegative().default(40).describe("Number of recent local branch tips to include as stack-map seeds."),
});

export const gtStackMapBranchesResultSchema = z.object({
	current: z.string(),
	trunk: z.string(),
	scope: z.literal(STACK_MAP_SCOPE),
	recent_limit: z.number().int().nonnegative(),
	branches: z.array(stackMapBranchSchema),
	edges: z.array(stackMapEdgeSchema),
	slots: z.array(stackMapSlotSchema),
	warnings: z.array(z.string()),
});

export type GtStackMapBranchesRequest = z.infer<typeof gtStackMapBranchesRequestSchema>;
export type GtStackMapBranchesResult = z.infer<typeof gtStackMapBranchesResultSchema>;
type StackMapBranch = z.infer<typeof stackMapBranchSchema>;
type StackMapEdge = z.infer<typeof stackMapEdgeSchema>;
type StackMapSlot = z.infer<typeof stackMapSlotSchema>;

export async function runGtStackMapBranches(ctx: SlotCliContext, request: GtStackMapBranchesRequest) {
	const resolved = await resolveRepoAndCurrentBranch(ctx);
	if (resolved.type !== "ok") return resolved;

	const stackResult = await ctx.gt.stack(resolved.repoCtx.repo.root);
	if (stackResult.type === "untracked_branch") return failure("untracked_branch", `${stackResult.message} — run \`gt track\` first`);
	if (stackResult.type === "failure") return failure("gt_stack_read_failed", stackResult.failure.message);

	const graphResult = await ctx.gt.stackGraph(resolved.repoCtx.repo.root);
	if (graphResult.type === "git_common_dir_missing") return failure("git_common_dir_missing", graphResult.message);
	if (graphResult.type === "failure") return failure("gt_metadata_read_failed", graphResult.failure.message);
	if (!graphResult.graph.topology.has(stackResult.stack.trunk)) {
		return failure("stack_metadata_inconsistent", `Graphite trunk branch ${stackResult.stack.trunk} is missing from metadata graph.`);
	}

	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: resolved.repoCtx.repo.mainRepoRoot });
	const slotRows = assignedSlotRows(inventory.records);
	const recentBranches = recentBranchNames(await ctx.git.listLocalBranchTips(), request.recent_limit);
	const localBranches = new Set(await ctx.git.listLocalBranches());
	const selection = selectVisibleBranches({
		topology: graphResult.graph.topology,
		stack: stackResult.stack,
		slotRows,
		recentBranches,
		localBranches,
	});
	const warnings = [...deduplicateOrderedStrings([
		...renderGraphWarnings(graphResult.graph.diagnostics),
		...renderStackWarnings(stackResult.stack),
		...selection.warnings,
	])];
	if (ctx.shouldWriteCdDirective) {
		for (const warning of warnings) ctx.stderr(`${warning}\n`);
	}

	const result: GtStackMapBranchesResult = {
		current: stackResult.stack.current,
		trunk: stackResult.stack.trunk,
		scope: STACK_MAP_SCOPE,
		recent_limit: request.recent_limit,
		branches: branchResults(graphResult.graph.topology, selection.selected),
		edges: edgeResults(graphResult.graph.topology, selection.selected),
		slots: slotRows,
		warnings,
	};
	return ok(result);
}

export function renderStackMapBranches(result: GtStackMapBranchesResult): string {
	// Hidden exec command: compact JSON is the intentional human renderer for skill/agent callers.
	return JSON.stringify({ branches: result.branches.map((branch) => branch.name) });
}

function assignedSlotRows(records: readonly SlotRecord[]): StackMapSlot[] {
	return records.flatMap((record) => record.branch === null ? [] : [{ slot_name: record.slotName, branch: record.branch, worktree_path: record.path, status: "assigned" as const }]);
}

function recentBranchNames(branchTips: readonly LocalBranchTip[], recentLimit: number): string[] {
	return [...branchTips]
		.sort(compareRecentTips)
		.slice(0, recentLimit)
		.map((tip) => tip.name);
}

function compareRecentTips(left: LocalBranchTip, right: LocalBranchTip): number {
	const leftHasTimestamp = left.headIso !== null;
	const rightHasTimestamp = right.headIso !== null;
	if (leftHasTimestamp !== rightHasTimestamp) return leftHasTimestamp ? -1 : 1;
	const leftTimestamp = left.headIso ?? "";
	const rightTimestamp = right.headIso ?? "";
	if (leftTimestamp > rightTimestamp) return -1;
	if (leftTimestamp < rightTimestamp) return 1;
	return 0;
}

function selectVisibleBranches(options: {
	readonly topology: GraphiteTopology;
	readonly stack: StackInfo;
	readonly slotRows: readonly StackMapSlot[];
	readonly recentBranches: readonly string[];
	readonly localBranches: ReadonlySet<string>;
}): { readonly selected: ReadonlySet<string>; readonly warnings: string[] } {
	const selected = new Set<string>([
		options.stack.trunk,
		options.stack.current,
		...options.stack.ancestors,
		...options.stack.descendants,
	]);
	const warnings: string[] = [];
	for (const slot of options.slotRows) {
		if (options.topology.has(slot.branch)) selected.add(slot.branch);
		else warnings.push(`assigned slot branch ${slot.branch} is missing from Graphite metadata; skipped`);
	}
	for (const branch of options.recentBranches) {
		if (options.topology.has(branch)) selected.add(branch);
	}
	for (const branch of [...selected]) {
		if (!options.topology.has(branch)) continue;
		const ancestors = collectAncestors({ branch, topology: options.topology });
		for (const selectedBranch of ancestors.branches) selected.add(selectedBranch);
		warnings.push(...ancestors.warnings);
		const descendants = collectDescendants({ branch, topology: options.topology });
		for (const selectedBranch of descendants.branches) selected.add(selectedBranch);
		warnings.push(...descendants.warnings);
	}
	return {
		selected: new Set([...selected].filter((branch) => options.topology.has(branch) && options.localBranches.has(branch))),
		warnings,
	};
}

function collectAncestors(options: { readonly branch: string; readonly topology: GraphiteTopology }): { readonly branches: readonly string[]; readonly warnings: readonly string[] } {
	const walk = walkGraphiteAncestors(options.topology, options.branch);
	const warning = renderWalkTerminationWarning({ kind: "ancestor", termination: walk.termination, label: "selection" });
	return {
		branches: [options.branch, ...walk.ancestors.filter((branch) => options.topology.has(branch))],
		warnings: warning === null ? [] : [warning],
	};
}

// Keep this stack-map-specific traversal local: walkGraphiteSubtree does not report missing child rows,
// but this command preserves Python-compatible descendant-selection warnings for missing metadata rows.
function collectDescendants(options: { readonly branch: string; readonly topology: GraphiteTopology }): { readonly branches: readonly string[]; readonly warnings: readonly string[] } {
	const branches: string[] = [];
	const warnings: string[] = [];
	const root = options.topology.get(options.branch);
	if (root === undefined) return { branches, warnings };
	const pending = [...root.children];
	const visited = new Set<string>([options.branch]);
	while (pending.length > 0) {
		const child = pending.pop();
		if (child === undefined) continue;
		if (visited.has(child)) {
			warnings.push(`cycle detected in Graphite children metadata at ${child}; descendant selection stopped`);
			continue;
		}
		visited.add(child);
		const row = options.topology.get(child);
		if (row === undefined) {
			warnings.push(`child branch ${child} is missing from Graphite metadata; descendant selection stopped`);
			continue;
		}
		branches.push(child);
		pending.push(...row.children);
	}
	return { branches, warnings };
}

function branchResults(topology: GraphiteTopology, selected: ReadonlySet<string>): StackMapBranch[] {
	return [...topology.values()].flatMap((row) => selected.has(row.branch) ? [branchResult(row, selected)] : []);
}

function branchResult(row: GraphiteBranchTopology, selected: ReadonlySet<string>): StackMapBranch {
	return {
		name: row.branch,
		parent: row.parent ?? null,
		children: row.children.filter((child) => selected.has(child)),
		validation_result: row.validationResult ?? null,
		needs_restack: row.validationResult === BAD_PARENT_NAME_VALIDATION_RESULT,
	};
}

function edgeResults(topology: GraphiteTopology, selected: ReadonlySet<string>): StackMapEdge[] {
	const edges: StackMapEdge[] = [];
	for (const branch of [...selected].sort()) {
		const row = topology.get(branch);
		if (row === undefined || row.parent === undefined || !selected.has(row.parent)) continue;
		edges.push({ parent: row.parent, child: row.branch });
	}
	return edges;
}

function renderGraphWarnings(diagnostics: GraphiteTopologyParseDiagnostics): string[] {
	return [
		...Array.from({ length: diagnostics.emptyBranchNameRows }, () => EMPTY_BRANCH_NAME_WARNING),
		...diagnostics.childrenCorruptions.map(renderChildrenCorruption),
	];
}

function renderStackWarnings(stack: StackInfo): string[] {
	const warnings: string[] = [];
	for (const corruption of stack.descendantWalk.childrenCorruptions) warnings.push(renderChildrenCorruption(corruption));
	const ancestorProblem = renderWalkTerminationWarning({ kind: "ancestor", termination: stack.ancestorTermination, label: "walk" });
	if (ancestorProblem !== null) warnings.push(ancestorProblem);
	for (const fork of stack.descendantWalk.forks) warnings.push(`branch ${fork.branch} has ${fork.children.length} Graphite children; descendants follow the first child only`);
	const descendantProblem = renderWalkTerminationWarning({ kind: "descendant", termination: stack.descendantWalk.termination, label: "walk" });
	if (descendantProblem !== null) warnings.push(descendantProblem);
	warnings.push(...renderTrunkMarkerWarnings(stack.trunkMarker));
	return warnings;
}

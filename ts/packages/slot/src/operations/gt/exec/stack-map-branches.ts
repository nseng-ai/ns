import { failure, ok } from "@asdl/clinkr";
import type { GraphiteBranchTopology, GraphiteChildrenCorruption, GraphiteTopology, GraphiteTopologyParseDiagnostics } from "@asdl/core/graphite-metadata";
import { z } from "zod";

import type { SlotCliContext } from "../../../context.ts";
import type { LocalBranchTip } from "../../../gateways/git.ts";
import type { StackInfo, TrunkMarkerStatus, WalkTermination } from "../../../gateways/gt.ts";
import { buildSlotInventory, type SlotRecord } from "../../../inventory.ts";
import { resolveRepoAndCurrentBranch } from "../shared.ts";

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
	const warnings = dedupeWarnings([
		...renderGraphWarnings(graphResult.graph.diagnostics),
		...renderStackWarnings(stackResult.stack),
		...selection.warnings,
	]);
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
		addAncestors(branch, selected, options.topology, warnings);
		addDescendants(branch, selected, options.topology, warnings);
	}
	return {
		selected: new Set([...selected].filter((branch) => options.topology.has(branch) && options.localBranches.has(branch))),
		warnings,
	};
}

function addAncestors(branch: string, selected: Set<string>, topology: GraphiteTopology, warnings: string[]): void {
	const visited = new Set<string>();
	let cursor: string | undefined = branch;
	while (cursor !== undefined) {
		if (visited.has(cursor)) {
			warnings.push(`cycle detected in Graphite parent metadata at ${cursor}; ancestor selection stopped`);
			return;
		}
		visited.add(cursor);
		const row = topology.get(cursor);
		if (row === undefined) {
			warnings.push(`parent branch ${cursor} is missing from Graphite metadata; ancestor selection stopped`);
			return;
		}
		selected.add(cursor);
		cursor = row.parent;
	}
}

function addDescendants(branch: string, selected: Set<string>, topology: GraphiteTopology, warnings: string[]): void {
	const root = topology.get(branch);
	if (root === undefined) return;
	const pending = [...root.children];
	const visited = new Set<string>([branch]);
	while (pending.length > 0) {
		const child = pending.pop();
		if (child === undefined) continue;
		if (visited.has(child)) {
			warnings.push(`cycle detected in Graphite children metadata at ${child}; descendant selection stopped`);
			continue;
		}
		visited.add(child);
		const row = topology.get(child);
		if (row === undefined) {
			warnings.push(`child branch ${child} is missing from Graphite metadata; descendant selection stopped`);
			continue;
		}
		selected.add(child);
		pending.push(...row.children);
	}
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
	const ancestorProblem = renderWalkTermination("ancestor", stack.ancestorTermination, "walk");
	if (ancestorProblem !== null) warnings.push(ancestorProblem);
	for (const fork of stack.descendantWalk.forks) warnings.push(`branch ${fork.branch} has ${fork.children.length} Graphite children; descendants follow the first child only`);
	const descendantProblem = renderWalkTermination("descendant", stack.descendantWalk.termination, "walk");
	if (descendantProblem !== null) warnings.push(descendantProblem);
	warnings.push(...renderTrunkMarkerWarnings(stack.trunkMarker));
	return warnings;
}

function renderWalkTermination(kind: "ancestor" | "descendant", termination: WalkTermination, label: "walk" | "selection"): string | null {
	if (termination.type === "completed") return null;
	if (termination.type === "cycle") return `cycle detected in Graphite ${kind === "ancestor" ? "parent" : "children"} metadata at ${termination.branch}; ${kind} ${label} stopped`;
	return `${kind === "ancestor" ? "parent" : "child"} branch ${termination.branch} is missing from Graphite metadata; ${kind} ${label} stopped`;
}

function renderChildrenCorruption(corruption: GraphiteChildrenCorruption): string {
	switch (corruption.kind) {
		case "not_text": return `children metadata for ${corruption.branch} is not JSON text; treating as no children`;
		case "invalid_json": return `children metadata for ${corruption.branch} is not valid JSON; treating as no children`;
		case "not_list": return `children metadata for ${corruption.branch} is not a JSON list; treating as no children`;
		case "non_string": return `children metadata for ${corruption.branch} contains non-string entries`;
	}
}

function renderTrunkMarkerWarnings(marker: TrunkMarkerStatus): string[] {
	if (marker.type === "clean") return [];
	if (marker.terminusState === "row_missing") return ["trunk row marker missing"];
	const warnings: string[] = [];
	if (marker.terminusState === "unmarked") warnings.push("trunk row marker missing");
	if (marker.markedTrunks.length > 1) warnings.push("multiple Graphite metadata rows are marked as trunk");
	if (marker.markedTrunks.length > 0 && !marker.markedTrunks.includes(marker.terminus)) warnings.push(`Graphite metadata trunk marker differs from ancestor-walk terminus: ${marker.markedTrunks[0]} != ${marker.terminus}`);
	return warnings;
}

function dedupeWarnings(warnings: readonly string[]): string[] {
	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const warning of warnings) {
		if (seen.has(warning)) continue;
		seen.add(warning);
		deduped.push(warning);
	}
	return deduped;
}

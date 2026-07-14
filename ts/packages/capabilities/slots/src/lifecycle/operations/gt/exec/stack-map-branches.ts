import { failure, ok } from "@nseng-ai/clinkr";
import type {
	GraphiteBranchTopology,
	GraphiteTopology,
	GraphiteTopologyParseDiagnostics,
	GraphiteWalkTermination,
} from "@nseng-ai/capability-kit/graphite/metadata";
import { z } from "zod";

import { deduplicateOrderedStrings } from "../../../../core/collections.ts";
import type { SlotCliContext } from "../../../../core/context.ts";
import {
	unwrapIncumbentRepositoryResult,
	type LocalBranchTip,
} from "../../../../core/gateways/repository.ts";
import type { StackInfo } from "@nseng-ai/capability-kit/graphite/stack";
import { buildSlotInventory, type SlotRecord } from "../../../../core/inventory.ts";
import { resolveRepoAndCurrentBranch } from "../shared.ts";
import {
	collectGraphiteTopologyAncestors,
	collectGraphiteTopologyDescendants,
} from "../stack-walk.ts";
import {
	renderChildrenCorruption,
	type GraphiteWalkKind,
	renderStackFork,
	renderTrunkMarkerWarnings,
	renderWalkTerminationWarning,
} from "./metadata-warnings.ts";

const STACK_MAP_SCOPE = "stack-map";
const BAD_PARENT_NAME_VALIDATION_RESULT = "BAD_PARENT_NAME";
const EMPTY_BRANCH_NAME_WARNING = "Graphite metadata row has an empty branchName; row ignored";

const stackMapBranchSchema = z.object({
	name: z.string(),
	parent: z.string().nullable(),
	children: z.array(z.string()),
	validationResult: z.string().nullable(),
	needsRestack: z.boolean(),
});

const stackMapEdgeSchema = z.object({ parent: z.string(), child: z.string() });

const stackMapSlotSchema = z.object({
	slotName: z.string(),
	branch: z.string(),
	worktreePath: z.string(),
	status: z.literal("assigned"),
});

export const gtStackMapBranchesRequestSchema = z.object({
	recentLimit: z
		.number()
		.int()
		.nonnegative()
		.default(40)
		.describe("Number of recent local branch tips to include as stack-map seeds."),
});

export const gtStackMapBranchesResultSchema = z.object({
	current: z.string(),
	trunk: z.string(),
	scope: z.literal(STACK_MAP_SCOPE),
	recentLimit: z.number().int().nonnegative(),
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

export async function runGtStackMapBranches(
	ctx: SlotCliContext,
	request: GtStackMapBranchesRequest,
) {
	const resolved = await resolveRepoAndCurrentBranch(ctx);
	if (resolved.type !== "ok") return resolved;

	const stackResult = await ctx.gt.stack(resolved.repoRoot);
	if (stackResult.type === "untracked_branch")
		return failure("untracked-branch", `${stackResult.message} — run \`gt track\` first`);
	if (stackResult.type === "failure")
		return failure("gt-stack-read-failed", stackResult.failure.message);

	const graphResult = await ctx.gt.stackGraph(resolved.repoRoot);
	if (graphResult.type === "git_common_dir_missing")
		return failure("git-common-dir-missing", graphResult.message);
	if (graphResult.type === "failure")
		return failure("gt-metadata-read-failed", graphResult.failure.message);
	if (!graphResult.graph.topology.has(stackResult.stack.trunk)) {
		return failure(
			"stack-metadata-inconsistent",
			`Graphite trunk branch ${stackResult.stack.trunk} is missing from metadata graph.`,
		);
	}

	const inventory = await buildSlotInventory(ctx.git, {
		mainRepoRoot: resolved.mainRepoRoot,
	});
	const slotRows = assignedSlotRows(inventory.records);
	const recentBranches = recentBranchNames(
		await ctx.git.listLocalBranchTips(),
		request.recentLimit,
	);
	const localBranches = new Set(unwrapIncumbentRepositoryResult(await ctx.git.listLocalBranches()));
	const selection = selectVisibleBranches({
		topology: graphResult.graph.topology,
		stack: stackResult.stack,
		slotRows,
		recentBranches,
		localBranches,
	});
	const warnings = [
		...deduplicateOrderedStrings([
			...renderGraphWarnings(graphResult.graph.diagnostics),
			...renderStackWarnings(stackResult.stack),
			...selection.warnings,
		]),
	];
	if (ctx.shouldWriteCdDirective) {
		for (const warning of warnings) ctx.stderr(`${warning}\n`);
	}

	const result: GtStackMapBranchesResult = {
		current: stackResult.stack.current,
		trunk: stackResult.stack.trunk,
		scope: STACK_MAP_SCOPE,
		recentLimit: request.recentLimit,
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
	return records.flatMap((record) =>
		record.branch === null
			? []
			: [
					{
						slotName: record.slotName,
						branch: record.branch,
						worktreePath: record.path,
						status: "assigned" as const,
					},
				],
	);
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
		else
			warnings.push(
				`assigned slot branch ${slot.branch} is missing from Graphite metadata; skipped`,
			);
	}
	for (const branch of options.recentBranches) {
		if (options.topology.has(branch)) selected.add(branch);
	}
	for (const branch of Array.from(selected)) {
		if (!options.topology.has(branch)) continue;
		const ancestors = collectGraphiteTopologyAncestors({ branch, topology: options.topology });
		for (const selectedBranch of ancestors.branches) selected.add(selectedBranch);
		warnings.push(...renderSelectionWarnings("ancestor", ancestors.problems));
		const descendants = collectGraphiteTopologyDescendants({ branch, topology: options.topology });
		for (const selectedBranch of descendants.branches) selected.add(selectedBranch);
		warnings.push(...renderSelectionWarnings("descendant", descendants.problems));
	}
	return {
		selected: new Set(
			[...selected].filter(
				(branch) => options.topology.has(branch) && options.localBranches.has(branch),
			),
		),
		warnings,
	};
}

function renderSelectionWarnings(
	kind: GraphiteWalkKind,
	problems: readonly GraphiteWalkTermination[],
): string[] {
	return problems.flatMap((termination) => {
		const warning = renderWalkTerminationWarning({ kind, termination, label: "selection" });
		return warning === null ? [] : [warning];
	});
}

function branchResults(
	topology: GraphiteTopology,
	selected: ReadonlySet<string>,
): StackMapBranch[] {
	return [...topology.values()].flatMap((row) =>
		selected.has(row.branch) ? [branchResult(row, selected)] : [],
	);
}

function branchResult(row: GraphiteBranchTopology, selected: ReadonlySet<string>): StackMapBranch {
	return {
		name: row.branch,
		parent: row.parent ?? null,
		children: row.children.filter((child) => selected.has(child)),
		validationResult: row.validationResult ?? null,
		needsRestack: row.validationResult === BAD_PARENT_NAME_VALIDATION_RESULT,
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
	for (const corruption of stack.descendantWalk.childrenCorruptions)
		warnings.push(renderChildrenCorruption(corruption));
	const ancestorProblem = renderWalkTerminationWarning({
		kind: "ancestor",
		termination: stack.ancestorTermination,
		label: "walk",
	});
	if (ancestorProblem !== null) warnings.push(ancestorProblem);
	for (const fork of stack.descendantWalk.forks) warnings.push(renderStackFork(fork));
	const descendantProblem = renderWalkTerminationWarning({
		kind: "descendant",
		termination: stack.descendantWalk.termination,
		label: "walk",
	});
	if (descendantProblem !== null) warnings.push(descendantProblem);
	warnings.push(...renderTrunkMarkerWarnings(stack.trunkMarker));
	return warnings;
}

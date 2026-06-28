import { basename } from "node:path";

import { failure, type ClinkrFailureExit, type RenderCapabilities } from "@sdl/clinkr";

import type { SlotCliContext } from "../../context.ts";
import { findByBranch, buildSlotInventory } from "../../inventory.ts";
import { checkoutBranch } from "../../lifecycle/checkout.ts";
import { prepareNavigation, type NavigationResultFields } from "../../navigation-result.ts";
import { renderSlotNavigationSuccess } from "../../navigation-presentation.ts";
import { extractSlotNumber } from "../../naming.ts";

export type GtNavigationResult = {
	slot_name: string | null;
	branch_name: string;
	already_assigned: boolean;
} & NavigationResultFields;

interface WorktreeTarget {
	slotName: string | null;
	branchName: string;
	worktreePath: string;
}

interface WorktreeResolution {
	target: WorktreeTarget;
	isAlreadyAssigned: boolean;
}

export type WorktreeResolutionResult =
	| { type: "ok"; resolution: WorktreeResolution }
	| ClinkrFailureExit;

export async function resolveOrCheckoutWorktreeForBranch(
	ctx: SlotCliContext,
	branch: string,
): Promise<WorktreeResolutionResult> {
	const existing = await findWorktreeForBranch(ctx, branch);
	if (existing !== null)
		return { type: "ok", resolution: { target: existing, isAlreadyAssigned: true } };
	const result = await checkoutBranch(ctx, branch, { shouldCreateBranch: false, base: null });
	if (result.type === "failure") return failure(result.failure.error_type, result.failure.message);
	return {
		type: "ok",
		resolution: {
			target: {
				slotName: result.outcome.slot_name.length === 0 ? null : result.outcome.slot_name,
				branchName: result.outcome.branch_name,
				worktreePath: result.outcome.worktree_path,
			},
			isAlreadyAssigned: result.outcome.already_assigned,
		},
	};
}

export async function buildGtNavigationResult(
	ctx: SlotCliContext,
	resolution: WorktreeResolution,
	options: { shouldCopyClipboard: boolean },
): Promise<GtNavigationResult> {
	const navigation = await prepareNavigation(ctx, resolution.target.worktreePath, {
		shouldCopyClipboard: options.shouldCopyClipboard,
		shouldWriteCdDirective: ctx.shouldWriteCdDirective,
	});
	return {
		slot_name: resolution.target.slotName,
		branch_name: resolution.target.branchName,
		already_assigned: resolution.isAlreadyAssigned,
		...navigation,
	};
}

export function renderGtNavigationResult(
	result: GtNavigationResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	return renderSlotNavigationSuccess(
		{ ...result, headline: renderGtNavigationHeadline(result) },
		caps,
	);
}

function renderGtNavigationHeadline(result: GtNavigationResult): string {
	if (result.slot_name === null)
		return `${result.branch_name} is checked out at ${result.worktree_path}`;
	if (result.already_assigned) return `${result.slot_name} -> ${result.branch_name}`;
	return `Checked out ${result.slot_name} -> ${result.branch_name}`;
}

async function findWorktreeForBranch(
	ctx: SlotCliContext,
	branch: string,
): Promise<WorktreeTarget | null> {
	if (ctx.repo.type === "repo") {
		const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
		const match = findByBranch(inventory, branch);
		if (match?.kind === "slot")
			return {
				slotName: match.record.slotName,
				branchName: branch,
				worktreePath: match.record.path,
			};
		if (match?.kind === "main")
			return { slotName: null, branchName: branch, worktreePath: match.worktree.path };
	}
	for (const worktree of await ctx.git.listWorktrees()) {
		if (worktree.branch !== branch) continue;
		const slotName =
			extractSlotNumber(basename(worktree.path)) === null ? null : basename(worktree.path);
		return { slotName, branchName: branch, worktreePath: worktree.path };
	}
	return null;
}

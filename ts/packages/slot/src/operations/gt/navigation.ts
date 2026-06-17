import { basename } from "node:path";

import { failure } from "@asdl/clinkr";

import type { SlotCliContext } from "../../context.ts";
import { findByBranch, buildSlotInventory } from "../../inventory.ts";
import { checkoutBranch } from "../../lifecycle/checkout.ts";
import { buildNavigationResultFields, renderNavigationFooter, writeNavigationCdDirective, type NavigationResultFields } from "../../navigation-result.ts";
import { extractSlotNumber } from "../../naming.ts";

export interface GtNavigationResult extends NavigationResultFields {
	slot_name: string | null;
	branch_name: string;
	already_assigned: boolean;
}

interface WorktreeTarget {
	slotName: string | null;
	branchName: string;
	worktreePath: string;
}

interface WorktreeResolution {
	target: WorktreeTarget;
	alreadyAssigned: boolean;
}

export async function resolveOrCheckoutWorktreeForBranch(ctx: SlotCliContext, branch: string): Promise<WorktreeResolution | ReturnType<typeof failure>> {
	const existing = await findWorktreeForBranch(ctx, branch);
	if (existing !== null) return { target: existing, alreadyAssigned: true };
	const result = await checkoutBranch(ctx, branch, { shouldCreateBranch: false, base: null });
	if (result.type === "failure") return failure(result.failure.error_type, result.failure.message);
	return {
		target: { slotName: result.outcome.slot_name.length === 0 ? null : result.outcome.slot_name, branchName: result.outcome.branch_name, worktreePath: result.outcome.worktree_path },
		alreadyAssigned: result.outcome.already_assigned,
	};
}

export async function buildGtNavigationResult(ctx: SlotCliContext, resolution: WorktreeResolution, options: { shouldSkipClipboard: boolean }): Promise<GtNavigationResult> {
	await writeNavigationCdDirective(ctx, resolution.target.worktreePath);
	const navigation = await buildNavigationResultFields(ctx, { worktreePath: resolution.target.worktreePath, shouldSkipClipboard: options.shouldSkipClipboard });
	return { slot_name: resolution.target.slotName, branch_name: resolution.target.branchName, already_assigned: resolution.alreadyAssigned, ...navigation };
}

export function renderGtNavigation(result: GtNavigationResult): string {
	const lines: string[] = [];
	if (result.slot_name === null) lines.push(`${result.branch_name} is checked out at ${result.worktree_path}`);
	else if (result.already_assigned) lines.push(`${result.slot_name} -> ${result.branch_name}`);
	else lines.push(`Checked out ${result.slot_name} -> ${result.branch_name}`);
	lines.push(...renderNavigationFooter(result));
	return lines.join("\n");
}

async function findWorktreeForBranch(ctx: SlotCliContext, branch: string): Promise<WorktreeTarget | null> {
	if (ctx.repo.type === "repo") {
		const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
		const match = findByBranch(inventory, branch);
		if (match?.kind === "slot") return { slotName: match.record.slotName, branchName: branch, worktreePath: match.record.path };
		if (match?.kind === "main") return { slotName: null, branchName: branch, worktreePath: match.worktree.path };
	}
	for (const worktree of await ctx.git.listWorktrees()) {
		if (worktree.branch !== branch) continue;
		const slotName = extractSlotNumber(basename(worktree.path)) === null ? null : basename(worktree.path);
		return { slotName, branchName: branch, worktreePath: worktree.path };
	}
	return null;
}

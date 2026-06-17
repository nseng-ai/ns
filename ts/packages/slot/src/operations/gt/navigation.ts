import { basename } from "node:path";

import { failure, type ClinkrFailureExit } from "@asdl/clinkr";

import type { SlotCliContext } from "../../context.ts";
import { findByBranch, buildSlotInventory } from "../../inventory.ts";
import { checkoutBranch } from "../../lifecycle/checkout.ts";
import { buildNavigationResultFields, renderNavigationFooter, writeNavigationCdDirective, type NavigationResultFields } from "../../navigation-result.ts";
import { extractSlotNumber } from "../../naming.ts";

export interface GtNavigationResult {
	slot_name: string | null;
	branch_name: string;
	is_already_assigned: boolean;
	worktree_path: string;
	cd_command: string;
	is_clipboard_copied: boolean;
	is_clipboard_skipped: boolean;
	clipboard_failure_reason: "backend_missing" | "subprocess_error" | null;
	clipboard_failure_detail: string | null;
}

interface WorktreeTarget {
	slotName: string | null;
	branchName: string;
	worktreePath: string;
}

interface WorktreeResolution {
	target: WorktreeTarget;
	isAlreadyAssigned: boolean;
}

export type WorktreeResolutionResult = { type: "ok"; resolution: WorktreeResolution } | ClinkrFailureExit;

export async function resolveOrCheckoutWorktreeForBranch(ctx: SlotCliContext, branch: string): Promise<WorktreeResolutionResult> {
	const existing = await findWorktreeForBranch(ctx, branch);
	if (existing !== null) return { type: "ok", resolution: { target: existing, isAlreadyAssigned: true } };
	const result = await checkoutBranch(ctx, branch, { shouldCreateBranch: false, base: null });
	if (result.type === "failure") return failure(result.failure.error_type, result.failure.message);
	return {
		type: "ok",
		resolution: { target: { slotName: result.outcome.slot_name.length === 0 ? null : result.outcome.slot_name, branchName: result.outcome.branch_name, worktreePath: result.outcome.worktree_path }, isAlreadyAssigned: result.outcome.already_assigned },
	};
}

export async function buildGtNavigationResult(ctx: SlotCliContext, resolution: WorktreeResolution, options: { shouldSkipClipboard: boolean }): Promise<GtNavigationResult> {
	await writeNavigationCdDirective(ctx, resolution.target.worktreePath);
	const navigation = await buildNavigationResultFields(ctx, { worktreePath: resolution.target.worktreePath, shouldSkipClipboard: options.shouldSkipClipboard });
	return {
		slot_name: resolution.target.slotName,
		branch_name: resolution.target.branchName,
		is_already_assigned: resolution.isAlreadyAssigned,
		worktree_path: navigation.worktree_path,
		cd_command: navigation.cd_command,
		is_clipboard_copied: navigation.clipboard_copied,
		is_clipboard_skipped: navigation.clipboard_skipped,
		clipboard_failure_reason: navigation.clipboard_failure_reason,
		clipboard_failure_detail: navigation.clipboard_failure_detail,
	};
}

export function renderGtNavigation(result: GtNavigationResult): string {
	const lines: string[] = [];
	if (result.slot_name === null) lines.push(`${result.branch_name} is checked out at ${result.worktree_path}`);
	else if (result.is_already_assigned) lines.push(`${result.slot_name} -> ${result.branch_name}`);
	else lines.push(`Checked out ${result.slot_name} -> ${result.branch_name}`);
	lines.push(...renderNavigationFooter(toNavigationResultFields(result)));
	return lines.join("\n");
}

function toNavigationResultFields(result: GtNavigationResult): NavigationResultFields {
	return {
		worktree_path: result.worktree_path,
		cd_command: result.cd_command,
		clipboard_copied: result.is_clipboard_copied,
		clipboard_skipped: result.is_clipboard_skipped,
		clipboard_failure_reason: result.clipboard_failure_reason,
		clipboard_failure_detail: result.clipboard_failure_detail,
	};
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

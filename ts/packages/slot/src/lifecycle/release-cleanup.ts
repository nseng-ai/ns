import type { SlotCliContext } from "../context.ts";
import { prFailureMessage } from "../gateways/pr.ts";
import type { FreedSlot } from "./release-target.ts";

export const SLOT_RELEASE_ALL_CLEANUP_ACTIONS = ["pr", "local_branch"] as const;
export const SLOT_GC_DELETE_BRANCH_CLEANUP_ACTIONS = ["local_branch"] as const;

export type SlotFreeCleanupAction = "pr" | "local_branch";
export type SlotFreeCleanupStatus = "planned" | "success" | "skipped" | "error";

export interface SlotFreeCleanupResult {
	slot_name: string;
	branch_name: string;
	action: SlotFreeCleanupAction;
	status: SlotFreeCleanupStatus;
	pr_number: number | null;
	message: string | null;
}

export async function planReleaseCleanup(ctx: SlotCliContext, targets: readonly FreedSlot[], cleanupActions: readonly SlotFreeCleanupAction[]): Promise<readonly SlotFreeCleanupResult[]> {
	return await buildReleaseCleanup(ctx, targets, cleanupActions, { shouldExecute: false });
}

export async function executeReleaseCleanup(ctx: SlotCliContext, targets: readonly FreedSlot[], cleanupActions: readonly SlotFreeCleanupAction[]): Promise<readonly SlotFreeCleanupResult[]> {
	return await buildReleaseCleanup(ctx, targets, cleanupActions, { shouldExecute: true });
}

async function buildReleaseCleanup(ctx: SlotCliContext, targets: readonly FreedSlot[], cleanupActions: readonly SlotFreeCleanupAction[], options: { shouldExecute: boolean }): Promise<readonly SlotFreeCleanupResult[]> {
	if (targets.length === 0 || cleanupActions.length === 0) return [];
	const results: SlotFreeCleanupResult[] = [];
	const trunkBranch = cleanupActions.includes("local_branch") ? await ctx.git.getTrunkBranch() : null;
	for (const target of targets) {
		for (const action of cleanupActions) {
			const result = action === "pr"
				? await buildPrCleanup(ctx, target, options.shouldExecute)
				: await buildLocalBranchCleanup(ctx, target, options.shouldExecute, trunkBranch ?? await ctx.git.getTrunkBranch());
			results.push(result);
			if (result.status === "error") return results;
		}
	}
	return results;
}

async function buildPrCleanup(ctx: SlotCliContext, target: FreedSlot, shouldExecute: boolean): Promise<SlotFreeCleanupResult> {
	const lookup = await ctx.pr.getPrForBranch(target.branch_name);
	if (lookup.type === "missing") return cleanupResult(target, "pr", "skipped", { message: "no matching PR" });
	if (lookup.type === "failure") return cleanupResult(target, "pr", "error", { message: prFailureMessage(lookup.failure, "gh pr view") });
	if (lookup.pr.state === "CLOSED" || lookup.pr.state === "MERGED") {
		return cleanupResult(target, "pr", "skipped", { prNumber: lookup.pr.number, message: "PR is already closed/merged" });
	}
	if (!shouldExecute) return cleanupResult(target, "pr", "planned", { prNumber: lookup.pr.number, message: "close PR" });
	const closeFailure = await ctx.pr.closePr(lookup.pr.number);
	if (closeFailure !== null) return cleanupResult(target, "pr", "error", { prNumber: lookup.pr.number, message: prFailureMessage(closeFailure, "gh pr close") });
	return cleanupResult(target, "pr", "success", { prNumber: lookup.pr.number, message: "closed PR" });
}

async function buildLocalBranchCleanup(ctx: SlotCliContext, target: FreedSlot, shouldExecute: boolean, trunkBranch: string): Promise<SlotFreeCleanupResult> {
	if (target.branch_name === trunkBranch) return cleanupResult(target, "local_branch", "error", { message: `refusing to delete trunk branch ${trunkBranch}` });
	if (!shouldExecute) return cleanupResult(target, "local_branch", "planned", { message: `force-delete ${target.branch_name}` });
	if (!(await ctx.git.branchExists(target.branch_name))) return cleanupResult(target, "local_branch", "skipped", { message: "already absent" });
	const deleteFailure = await ctx.git.deleteLocalBranch(target.branch_name, { shouldForce: true });
	if (deleteFailure === null) return cleanupResult(target, "local_branch", "success", { message: `deleted ${target.branch_name}` });
	if (deleteFailure.message.includes(`branch '${target.branch_name}' not found`)) return cleanupResult(target, "local_branch", "skipped", { message: "already absent" });
	return cleanupResult(target, "local_branch", "error", { message: deleteFailure.message });
}

function cleanupResult(target: FreedSlot, action: SlotFreeCleanupAction, status: SlotFreeCleanupStatus, options: { prNumber?: number | undefined; message?: string | undefined } = {}): SlotFreeCleanupResult {
	return {
		slot_name: target.slot_name,
		branch_name: target.branch_name,
		action,
		status,
		pr_number: options.prNumber ?? null,
		message: options.message ?? null,
	};
}

export function cleanupErrorCount(results: readonly SlotFreeCleanupResult[]): number {
	return results.filter((result) => result.status === "error").length;
}

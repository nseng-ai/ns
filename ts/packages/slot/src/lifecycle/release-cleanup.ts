import type { RepoSlotContext } from "../context.ts";
import { prFailureMessage } from "../gateways/pr.ts";
import type { FreedSlot } from "./release-target.ts";

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

export const SLOT_RELEASE_ALL_CLEANUP_ACTIONS = ["pr", "local_branch"] as const satisfies readonly SlotFreeCleanupAction[];

export async function planReleaseCleanup(ctx: RepoSlotContext, targets: readonly FreedSlot[], cleanupActions: readonly SlotFreeCleanupAction[], options: { trunkBranch?: string | undefined } = {}): Promise<readonly SlotFreeCleanupResult[]> {
	return await cleanupForTargets(ctx, targets, cleanupActions, { trunkBranch: options.trunkBranch, shouldExecute: false });
}

export async function executeReleaseCleanup(ctx: RepoSlotContext, targets: readonly FreedSlot[], cleanupActions: readonly SlotFreeCleanupAction[], options: { trunkBranch?: string | undefined } = {}): Promise<readonly SlotFreeCleanupResult[]> {
	return await cleanupForTargets(ctx, targets, cleanupActions, { trunkBranch: options.trunkBranch, shouldExecute: true });
}

async function cleanupForTargets(ctx: RepoSlotContext, targets: readonly FreedSlot[], cleanupActions: readonly SlotFreeCleanupAction[], options: { trunkBranch?: string | undefined; shouldExecute: boolean }): Promise<readonly SlotFreeCleanupResult[]> {
	if (targets.length === 0 || cleanupActions.length === 0) return [];
	const needsTrunk = cleanupActions.includes("local_branch");
	const trunkBranch = needsTrunk ? options.trunkBranch ?? await ctx.git.getTrunkBranch() : null;
	const results: SlotFreeCleanupResult[] = [];
	for (const target of targets) {
		for (const action of cleanupActions) {
			const result = action === "pr" ? await cleanupPr(ctx, target, options.shouldExecute) : await cleanupLocalBranch(ctx, target, trunkBranch ?? "", options.shouldExecute);
			results.push(result);
			if (result.status === "error") return results;
		}
	}
	return results;
}

async function cleanupPr(ctx: RepoSlotContext, target: FreedSlot, shouldExecute: boolean): Promise<SlotFreeCleanupResult> {
	const lookup = await ctx.pr.getPrForBranch(target.branch_name);
	if (lookup.type === "miss") return cleanupResult(target, "pr", "skipped", { message: "no matching PR" });
	if (lookup.type === "failure") return cleanupResult(target, "pr", "error", { message: prFailureMessage(lookup.failure) });
	if (lookup.pr.state === "CLOSED" || lookup.pr.state === "MERGED") return cleanupResult(target, "pr", "skipped", { prNumber: lookup.pr.number, message: `PR is already ${lookup.pr.state.toLowerCase()}` });
	if (!shouldExecute) return cleanupResult(target, "pr", "planned", { prNumber: lookup.pr.number });
	const close = await ctx.pr.closePr(lookup.pr.number);
	if (close.type === "failure") return cleanupResult(target, "pr", "error", { prNumber: lookup.pr.number, message: prFailureMessage(close.failure) });
	return cleanupResult(target, "pr", "success", { prNumber: lookup.pr.number });
}

async function cleanupLocalBranch(ctx: RepoSlotContext, target: FreedSlot, trunkBranch: string, shouldExecute: boolean): Promise<SlotFreeCleanupResult> {
	if (target.branch_name === trunkBranch) return cleanupResult(target, "local_branch", "error", { message: `refusing to delete trunk branch ${trunkBranch}` });
	if (!shouldExecute) return cleanupResult(target, "local_branch", "planned");
	if (!(await ctx.git.branchExists(target.branch_name))) return cleanupResult(target, "local_branch", "skipped", { message: "already absent" });
	const failure = await ctx.git.deleteLocalBranch(target.branch_name, { shouldForce: true });
	if (failure === null) return cleanupResult(target, "local_branch", "success");
	if (isMissingLocalBranchFailure(failure.message, target.branch_name)) return cleanupResult(target, "local_branch", "skipped", { message: "already absent" });
	return cleanupResult(target, "local_branch", "error", { message: failure.message });
}

function cleanupResult(target: FreedSlot, action: SlotFreeCleanupAction, status: SlotFreeCleanupStatus, options: { prNumber?: number | undefined; message?: string | undefined } = {}): SlotFreeCleanupResult {
	return { slot_name: target.slot_name, branch_name: target.branch_name, action, status, pr_number: options.prNumber ?? null, message: options.message ?? null };
}

function isMissingLocalBranchFailure(message: string, branch: string): boolean {
	return message.toLowerCase().includes(`branch '${branch.toLowerCase()}' not found`);
}

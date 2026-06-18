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

export interface PlanReleaseCleanupOptions {
	ctx: RepoSlotContext;
	targets: readonly FreedSlot[];
	cleanupActions: readonly SlotFreeCleanupAction[];
	trunkBranch?: string | undefined;
}

export interface ExecuteReleaseCleanupOptions {
	ctx: RepoSlotContext;
	targets: readonly FreedSlot[];
	cleanupActions: readonly SlotFreeCleanupAction[];
	trunkBranch?: string | undefined;
}

interface CleanupForTargetsOptions {
	ctx: RepoSlotContext;
	targets: readonly FreedSlot[];
	cleanupActions: readonly SlotFreeCleanupAction[];
	trunkBranch?: string | undefined;
	shouldExecute: boolean;
}

interface CleanupLocalBranchOptions {
	ctx: RepoSlotContext;
	target: FreedSlot;
	trunkBranch: string;
	shouldExecute: boolean;
}

interface CleanupResultOptions {
	target: FreedSlot;
	action: SlotFreeCleanupAction;
	status: SlotFreeCleanupStatus;
	prNumber?: number | undefined;
	message?: string | undefined;
}

export async function planReleaseCleanup(options: PlanReleaseCleanupOptions): Promise<readonly SlotFreeCleanupResult[]> {
	return await cleanupForTargets({ ...options, shouldExecute: false });
}

export async function executeReleaseCleanup(options: ExecuteReleaseCleanupOptions): Promise<readonly SlotFreeCleanupResult[]> {
	return await cleanupForTargets({ ...options, shouldExecute: true });
}

async function cleanupForTargets(options: CleanupForTargetsOptions): Promise<readonly SlotFreeCleanupResult[]> {
	if (options.targets.length === 0 || options.cleanupActions.length === 0) return [];
	const needsTrunk = options.cleanupActions.includes("local_branch");
	const trunkBranch = needsTrunk ? options.trunkBranch ?? await options.ctx.git.getTrunkBranch() : null;
	const results: SlotFreeCleanupResult[] = [];
	for (const target of options.targets) {
		for (const action of options.cleanupActions) {
			const result = action === "pr" ? await cleanupPr(options.ctx, target, options.shouldExecute) : await cleanupLocalBranch({ ctx: options.ctx, target, trunkBranch: requireTrunkBranch(trunkBranch), shouldExecute: options.shouldExecute });
			results.push(result);
			if (result.status === "error") return results;
		}
	}
	return results;
}

async function cleanupPr(ctx: RepoSlotContext, target: FreedSlot, shouldExecute: boolean): Promise<SlotFreeCleanupResult> {
	const lookup = await ctx.pr.getPrForBranch(target.branch_name);
	if (lookup.type === "miss") return cleanupResult({ target, action: "pr", status: "skipped", message: "no matching PR" });
	if (lookup.type === "failure") return cleanupResult({ target, action: "pr", status: "error", message: prFailureMessage(lookup.failure) });
	if (lookup.pr.state === "CLOSED" || lookup.pr.state === "MERGED") return cleanupResult({ target, action: "pr", status: "skipped", prNumber: lookup.pr.number, message: `PR is already ${lookup.pr.state.toLowerCase()}` });
	if (!shouldExecute) return cleanupResult({ target, action: "pr", status: "planned", prNumber: lookup.pr.number });
	const close = await ctx.pr.closePr(lookup.pr.number);
	if (close.type === "failure") return cleanupResult({ target, action: "pr", status: "error", prNumber: lookup.pr.number, message: prFailureMessage(close.failure) });
	return cleanupResult({ target, action: "pr", status: "success", prNumber: lookup.pr.number });
}

async function cleanupLocalBranch(options: CleanupLocalBranchOptions): Promise<SlotFreeCleanupResult> {
	if (options.target.branch_name === options.trunkBranch) return cleanupResult({ target: options.target, action: "local_branch", status: "error", message: `refusing to delete trunk branch ${options.trunkBranch}` });
	if (!options.shouldExecute) return cleanupResult({ target: options.target, action: "local_branch", status: "planned" });
	if (!(await options.ctx.git.branchExists(options.target.branch_name))) return cleanupResult({ target: options.target, action: "local_branch", status: "skipped", message: "already absent" });
	const failure = await options.ctx.git.deleteLocalBranch(options.target.branch_name, { shouldForce: true });
	if (failure === null) return cleanupResult({ target: options.target, action: "local_branch", status: "success" });
	if (isMissingLocalBranchFailure(failure.message, options.target.branch_name)) return cleanupResult({ target: options.target, action: "local_branch", status: "skipped", message: "already absent" });
	return cleanupResult({ target: options.target, action: "local_branch", status: "error", message: failure.message });
}

function cleanupResult(options: CleanupResultOptions): SlotFreeCleanupResult {
	return { slot_name: options.target.slot_name, branch_name: options.target.branch_name, action: options.action, status: options.status, pr_number: options.prNumber ?? null, message: options.message ?? null };
}

function requireTrunkBranch(trunkBranch: string | null): string {
	if (trunkBranch === null) throw new Error("local branch cleanup requires a resolved trunk branch");
	return trunkBranch;
}

function isMissingLocalBranchFailure(message: string, branch: string): boolean {
	return message.toLowerCase().includes(`branch '${branch.toLowerCase()}' not found`);
}

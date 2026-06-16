import type { SlotCliContext } from "../context.ts";
import { buildSlotInventory } from "../inventory.ts";
import { planCheckout, planCurrentCheckout, type CheckoutPlan } from "../planning.ts";
import { ensureSlotsMetadataDir } from "../repo-context.ts";
import { branchInUseFailure, poolFullFailure, type LifecycleResult, type SlotLifecycleFailure } from "./common.ts";
import { executeCurrentWorktreeRedirect } from "./current-worktree-redirect.ts";

export interface SlotCheckoutOutcome {
	slot_name: string;
	branch_name: string;
	worktree_path: string;
	already_assigned: boolean;
	created_branch: boolean;
	current_wt_note: string | null;
}

export type SlotCheckoutResult = LifecycleResult<SlotCheckoutOutcome>;

type ExecutableCheckoutPlan = Extract<CheckoutPlan, { type: "reuse_assignment" | "branch_in_main_worktree" | "assign_to_slot" }>;

export async function checkoutBranch(ctx: SlotCliContext, branchName: string, options: { newBranch: boolean; base: string | null }): Promise<SlotCheckoutResult> {
	if (ctx.repo.type !== "repo") return { type: "failure", failure: { error_type: ctx.repo.errorType, message: ctx.repo.message } };
	await ensureSlotsMetadataDir(ctx.repo, ctx.storage);

	const branchExists = await ctx.git.branchExists(branchName);
	let createdBranch = false;
	if (options.newBranch) {
		if (branchExists) return failure("branch_exists", `Branch '${branchName}' already exists. Drop -b to check out the existing branch.`);
		if (options.base !== null && !(await ctx.git.branchExists(options.base))) return failure("base_missing", `Base branch '${options.base}' does not exist.`);
		const createFailure = await ctx.git.createBranch(branchName, options.base ?? "HEAD", { force: false });
		if (createFailure !== null) return failure("branch_create_failed", `Failed to create branch '${branchName}': ${createFailure.message}`);
		createdBranch = true;
	} else if (!branchExists) {
		return failure("branch_missing", `Branch '${branchName}' does not exist. Pass -b/--new to create it from HEAD.`);
	}

	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	const plan = await planCheckout(inventory, ctx.git, branchName);
	if (plan.type === "pool_full") return { type: "failure", failure: poolFullFailure(plan.assigned, { action: "checking out a new branch" }) };
	if (plan.type === "branch_in_use") return { type: "failure", failure: branchInUseFailure(plan.occupancy) };
	return await executeCheckoutPlan(plan, ctx, { branchName, createdBranch, currentWtNote: null });
}

export async function checkoutCurrent(ctx: SlotCliContext): Promise<SlotCheckoutResult> {
	if (ctx.repo.type !== "repo") return { type: "failure", failure: { error_type: ctx.repo.errorType, message: ctx.repo.message } };
	await ensureSlotsMetadataDir(ctx.repo, ctx.storage);

	const currentPlan = await planCurrentCheckout(ctx.git, { cwd: ctx.repo.root, mainRepoRoot: ctx.repo.mainRepoRoot });
	if (currentPlan.type === "allocation_failure") return failure("slot_allocation_error", currentPlan.message);
	if (currentPlan.type === "detached_head") return failure("detached_head", `HEAD at ${currentPlan.cwd} is detached. Check out a branch before running \`slot checkout --current\`.`);
	if (currentPlan.type === "dirty_worktree") return failure("dirty_worktree", `Current worktree at ${currentPlan.cwd} has uncommitted changes. Commit or stash before running \`slot checkout --current\`.`);
	if (currentPlan.plan.type === "pool_full") return { type: "failure", failure: poolFullFailure(currentPlan.plan.assigned, { action: "checking out a new branch" }) };
	if (currentPlan.plan.type === "branch_in_use") return { type: "failure", failure: branchInUseFailure(currentPlan.plan.occupancy) };
	if (currentPlan.redirect !== null) {
		const redirectFailure = await executeCurrentWorktreeRedirect(currentPlan.redirect, ctx);
		if (redirectFailure !== null) return { type: "failure", failure: redirectFailure };
	}
	return await executeCheckoutPlan(currentPlan.plan, ctx, { branchName: currentPlan.branchName, createdBranch: false, currentWtNote: currentPlan.currentWtNote });
}

async function executeCheckoutPlan(plan: ExecutableCheckoutPlan, ctx: SlotCliContext, options: { branchName: string; createdBranch: boolean; currentWtNote: string | null }): Promise<SlotCheckoutResult> {
	if (plan.type === "reuse_assignment") {
		return ok({ slot_name: plan.record.slotName, branch_name: options.branchName, worktree_path: plan.record.path, already_assigned: true, created_branch: options.createdBranch, current_wt_note: options.currentWtNote });
	}
	if (plan.type === "branch_in_main_worktree") {
		return ok({ slot_name: "", branch_name: options.branchName, worktree_path: plan.mainPath, already_assigned: true, created_branch: options.createdBranch, current_wt_note: options.currentWtNote });
	}
	const checkoutFailure = await ctx.git.checkoutBranch(plan.record.path, options.branchName);
	if (checkoutFailure !== null) return failure("checkout_failed", `Failed to check out '${options.branchName}' into ${plan.record.slotName}: ${checkoutFailure.message}`);
	return ok({ slot_name: plan.record.slotName, branch_name: options.branchName, worktree_path: plan.record.path, already_assigned: false, created_branch: options.createdBranch, current_wt_note: options.currentWtNote });
}

function ok(outcome: SlotCheckoutOutcome): SlotCheckoutResult {
	return { type: "ok", outcome };
}

function failure(errorType: string, message: string): SlotCheckoutResult {
	const lifecycleFailure: SlotLifecycleFailure = { error_type: errorType, message };
	return { type: "failure", failure: lifecycleFailure };
}

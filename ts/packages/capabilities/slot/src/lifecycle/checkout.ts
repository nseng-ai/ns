import type { RepoSlotContext, SlotCliContext } from "../context.ts";
import { buildSlotInventory } from "../inventory.ts";
import { planCheckout, planCurrentCheckout, type CheckoutPlan } from "../planning.ts";
import { ensureSlotsMetadataDir } from "../repo-context.ts";
import {
	branchInUseFailure,
	poolFullFailure,
	type LifecycleResult,
	type SlotLifecycleFailure,
} from "./common.ts";
import { executeCurrentWorktreeRedirect } from "./current-worktree-redirect.ts";

export interface SlotCheckoutOutcome {
	slotName: string;
	branchName: string;
	worktreePath: string;
	alreadyAssigned: boolean;
	createdBranch: boolean;
	currentWtNote: string | null;
}

export type SlotCheckoutResult = LifecycleResult<SlotCheckoutOutcome>;

type ExecutableCheckoutPlan = Extract<
	CheckoutPlan,
	{ type: "reuse_assignment" | "branch_in_main_worktree" | "assign_to_slot" }
>;

export async function checkoutBranch(
	ctx: SlotCliContext,
	branchName: string,
	options: { shouldCreateBranch: boolean; base: string | null },
): Promise<SlotCheckoutResult> {
	if (ctx.repo.type !== "repo")
		return {
			type: "failure",
			failure: { errorType: ctx.repo.errorType, message: ctx.repo.message },
		};
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	await ensureSlotsMetadataDir(repoCtx.repo, repoCtx.storage);

	const branchExists = await repoCtx.git.branchExists(branchName);
	let hasCreatedBranch = false;
	if (options.shouldCreateBranch) {
		if (branchExists)
			return failure(
				"branch-exists",
				`Branch '${branchName}' already exists. Drop -b to check out the existing branch.`,
			);
		if (options.base !== null && !(await repoCtx.git.branchExists(options.base)))
			return failure("base-missing", `Base branch '${options.base}' does not exist.`);
		const createFailure = await repoCtx.git.createBranch(branchName, options.base ?? "HEAD", {
			shouldForce: false,
		});
		if (createFailure !== null)
			return failure(
				"branch-create-failed",
				`Failed to create branch '${branchName}': ${createFailure.message}`,
			);
		hasCreatedBranch = true;
	} else if (!branchExists) {
		return failure(
			"branch-missing",
			`Branch '${branchName}' does not exist. Pass -b/--new to create it from HEAD.`,
		);
	}

	const inventory = await buildSlotInventory(repoCtx.git, {
		mainRepoRoot: repoCtx.repo.mainRepoRoot,
	});
	const plan = await planCheckout(inventory, repoCtx.git, branchName);
	if (plan.type === "pool_full")
		return {
			type: "failure",
			failure: poolFullFailure(plan.assigned, { action: "checking out a new branch" }),
		};
	if (plan.type === "branch_in_use")
		return { type: "failure", failure: branchInUseFailure(plan.occupancy) };
	return await executeCheckoutPlan(plan, repoCtx, {
		branchName,
		hasCreatedBranch,
		currentWtNote: null,
	});
}

export async function checkoutCurrent(ctx: SlotCliContext): Promise<SlotCheckoutResult> {
	if (ctx.repo.type !== "repo")
		return {
			type: "failure",
			failure: { errorType: ctx.repo.errorType, message: ctx.repo.message },
		};
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	await ensureSlotsMetadataDir(repoCtx.repo, repoCtx.storage);

	const currentPlan = await planCurrentCheckout(repoCtx.git, {
		cwd: repoCtx.repo.root,
		mainRepoRoot: repoCtx.repo.mainRepoRoot,
	});
	if (currentPlan.type === "allocation_failure")
		return failure("slot-allocation-error", currentPlan.message);
	if (currentPlan.type === "detached_head")
		return failure(
			"detached-head",
			`HEAD at ${currentPlan.cwd} is detached. Check out a branch before running \`sdl slot checkout --current\`.`,
		);
	if (currentPlan.type === "dirty_worktree")
		return failure(
			"dirty-worktree",
			`Current worktree at ${currentPlan.cwd} has uncommitted changes. Commit or stash before running \`sdl slot checkout --current\`.`,
		);
	if (currentPlan.plan.type === "pool_full")
		return {
			type: "failure",
			failure: poolFullFailure(currentPlan.plan.assigned, { action: "checking out a new branch" }),
		};
	if (currentPlan.plan.type === "branch_in_use")
		return { type: "failure", failure: branchInUseFailure(currentPlan.plan.occupancy) };
	if (currentPlan.redirect !== null) {
		const redirectFailure = await executeCurrentWorktreeRedirect(currentPlan.redirect, repoCtx);
		if (redirectFailure !== null) return { type: "failure", failure: redirectFailure };
	}
	return await executeCheckoutPlan(currentPlan.plan, repoCtx, {
		branchName: currentPlan.branchName,
		hasCreatedBranch: false,
		currentWtNote: currentPlan.currentWtNote,
	});
}

async function executeCheckoutPlan(
	plan: ExecutableCheckoutPlan,
	ctx: RepoSlotContext,
	options: { branchName: string; hasCreatedBranch: boolean; currentWtNote: string | null },
): Promise<SlotCheckoutResult> {
	if (plan.type === "reuse_assignment") {
		return ok({
			slotName: plan.record.slotName,
			branchName: options.branchName,
			worktreePath: plan.record.path,
			alreadyAssigned: true,
			createdBranch: options.hasCreatedBranch,
			currentWtNote: options.currentWtNote,
		});
	}
	if (plan.type === "branch_in_main_worktree") {
		return ok({
			slotName: "",
			branchName: options.branchName,
			worktreePath: plan.mainPath,
			alreadyAssigned: true,
			createdBranch: options.hasCreatedBranch,
			currentWtNote: options.currentWtNote,
		});
	}
	const checkoutFailure = await ctx.git.checkoutBranch(plan.record.path, options.branchName);
	if (checkoutFailure !== null)
		return failure(
			"checkout-failed",
			`Failed to check out '${options.branchName}' into ${plan.record.slotName}: ${checkoutFailure.message}`,
		);
	return ok({
		slotName: plan.record.slotName,
		branchName: options.branchName,
		worktreePath: plan.record.path,
		alreadyAssigned: false,
		createdBranch: options.hasCreatedBranch,
		currentWtNote: options.currentWtNote,
	});
}

function ok(outcome: SlotCheckoutOutcome): SlotCheckoutResult {
	return { type: "ok", outcome };
}

function failure(errorType: string, message: string): SlotCheckoutResult {
	const lifecycleFailure: SlotLifecycleFailure = { errorType: errorType, message };
	return { type: "failure", failure: lifecycleFailure };
}

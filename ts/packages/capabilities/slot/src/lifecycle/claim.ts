import type { RepoSlotContext, SlotCliContext } from "../context.ts";
import type { CurrentWorktreeRedirect } from "../planning.ts";
import {
	findByBranch,
	findOccupancyByBranch,
	lowestAvailable,
	type SlotInventory,
	type SlotRecord,
	buildSlotInventory,
} from "../inventory.ts";
import { planCurrentWtRedirect } from "../planning.ts";
import { ensureSlotsMetadataDir } from "../repo-context.ts";
import {
	assignedSlotRecords,
	branchOccupancyMessage,
	poolFullFailure,
	slotOperationMessage,
	type LifecycleResult,
	type SlotLifecycleFailure,
} from "./common.ts";
import { executeCurrentWorktreeRedirect } from "./current-worktree-redirect.ts";

export interface SlotClaimOutcome {
	slot_name: string;
	branch_name: string;
	worktree_path: string;
	replaced_branch_name: string | null;
	source_slot_name: string | null;
	source_worktree_path: string | null;
	already_current: boolean;
	main_worktree_path: string | null;
	main_checkout_branch: string | null;
	main_redirect_action: "checkout_branch" | "detach_head" | null;
	main_redirect_ref: string | null;
	main_redirect_note: string | null;
}

export type SlotClaimResult = LifecycleResult<SlotClaimOutcome>;

interface ClaimPlan {
	target: SlotRecord;
	slotCheckoutBranch: string;
	source: SlotRecord | null;
	isAlreadyCurrent: boolean;
	callerRedirect: CurrentWorktreeRedirect | null;
	mainRedirect: CurrentWorktreeRedirect | null;
}

export async function claimBranch(
	ctx: SlotCliContext,
	branchName: string,
): Promise<SlotClaimResult> {
	if (ctx.repo.type !== "repo")
		return {
			type: "failure",
			failure: { error_type: ctx.repo.errorType, message: ctx.repo.message },
		};
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	await ensureSlotsMetadataDir(repoCtx.repo, repoCtx.storage);
	if (!(await repoCtx.git.branchExists(branchName)))
		return failure("branch_missing", `Branch '${branchName}' does not exist locally.`);

	const planResult = await planClaim(repoCtx, branchName);
	if (planResult.type === "failure") return planResult;
	const plan = planResult.outcome;
	if (plan.isAlreadyCurrent) return ok(outcomeFromPlan(repoCtx, plan));

	const trunkBranch = await repoCtx.git.getTrunkBranch();
	if (plan.source !== null) {
		const sourceBranch = plan.source.branch;
		if (sourceBranch === null)
			throw new Error(`claim source slot ${plan.source.slotName} has no branch`);
		const sourceFailure = await detachSourceSlot(repoCtx, plan.source, sourceBranch, trunkBranch);
		if (sourceFailure !== null) return { type: "failure", failure: sourceFailure };
	}
	const redirect = plan.mainRedirect ?? plan.callerRedirect;
	if (redirect !== null) {
		const redirectFailure = await executeCurrentWorktreeRedirect(redirect, repoCtx);
		if (redirectFailure !== null) return { type: "failure", failure: redirectFailure };
	}
	const checkoutFailure = await repoCtx.git.checkoutBranch(
		plan.target.path,
		plan.slotCheckoutBranch,
	);
	if (checkoutFailure !== null)
		return failure(
			"checkout_failed",
			`Failed to check out '${plan.slotCheckoutBranch}' into ${plan.target.slotName}: ${checkoutFailure.message}`,
		);
	return ok(outcomeFromPlan(repoCtx, plan));
}

async function planClaim(
	ctx: RepoSlotContext,
	branchName: string,
): Promise<LifecycleResult<ClaimPlan>> {
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	if (inventory.records.length === 0)
		return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	const current = currentSlotRecord(inventory.records, ctx.repo.root);
	if (current === null) return await planClaimFromMainWorktree(ctx, inventory, branchName);
	if (current.operation !== null)
		return failure(
			"operation_in_progress",
			slotOperationMessage(current, { action: "claiming into" }),
		);

	const match = findByBranch(inventory, branchName);
	if (match?.kind === "slot") {
		if (match.record.path === current.path)
			return okPlan({
				target: current,
				slotCheckoutBranch: branchName,
				source: null,
				isAlreadyCurrent: true,
				callerRedirect: null,
				mainRedirect: null,
			});
		const sourceFailure = await sourceSlotFailure(ctx, match.record);
		if (sourceFailure !== null) return { type: "failure", failure: sourceFailure };
		const currentFailure = await currentSlotDirtyFailure(ctx, current);
		if (currentFailure !== null) return { type: "failure", failure: currentFailure };
		return okPlan({
			target: current,
			slotCheckoutBranch: branchName,
			source: match.record,
			isAlreadyCurrent: false,
			callerRedirect: null,
			mainRedirect: null,
		});
	}
	if (match?.kind === "main")
		return failure(
			"branch_in_main_worktree",
			`Branch '${branchName}' is checked out in the main worktree at ${match.worktree.path}; \`slot claim\` only moves branches from other slots.`,
		);

	const occupancy = findOccupancyByBranch(inventory, branchName);
	if (occupancy !== null) return failure("branch_in_use", branchOccupancyMessage(occupancy));
	const currentFailure = await currentSlotDirtyFailure(ctx, current);
	if (currentFailure !== null) return { type: "failure", failure: currentFailure };
	return okPlan({
		target: current,
		slotCheckoutBranch: branchName,
		source: null,
		isAlreadyCurrent: false,
		callerRedirect: null,
		mainRedirect: null,
	});
}

async function planClaimFromMainWorktree(
	ctx: RepoSlotContext,
	inventory: SlotInventory,
	branchName: string,
): Promise<LifecycleResult<ClaimPlan>> {
	if (ctx.repo.root !== ctx.repo.mainRepoRoot) return notCurrentSlotFailure(ctx);
	const trunkBranch = await ctx.git.getTrunkBranch();
	if (branchName === trunkBranch) {
		const trunkPlan = await planTrunkClaimFromMainWorktree(ctx, inventory, trunkBranch);
		if (trunkPlan !== null) return trunkPlan;
	}

	const match = findByBranch(inventory, branchName);
	if (match?.kind === "slot") {
		if (match.record.operation !== null)
			return failure("branch_in_use", slotOperationMessage(match.record, { action: "claiming" }));
		return okPlan({
			target: match.record,
			slotCheckoutBranch: branchName,
			source: null,
			isAlreadyCurrent: true,
			callerRedirect: null,
			mainRedirect: null,
		});
	}
	if (match?.kind === "main") {
		if (match.worktree.path !== ctx.repo.root)
			return failure(
				"branch_in_main_worktree",
				`Branch '${branchName}' is checked out in the main worktree at ${match.worktree.path}. Run \`slot claim\` from that worktree to move it into a slot.`,
			);
		const currentBranch = await ctx.git.getCurrentBranch(ctx.repo.root);
		if (currentBranch.type === "failure")
			return failure(
				"current_branch_failed",
				`Failed to determine current branch at ${ctx.repo.root}: ${currentBranch.failure.message}`,
			);
		if (currentBranch.type === "detached" || currentBranch.branch !== branchName)
			return notCurrentSlotFailure(ctx);
		const target = await lowestAvailable(inventory, ctx.git);
		if (target === null)
			return {
				type: "failure",
				failure: poolFullFailure(assignedSlotRecords(inventory.records), {
					action: "claiming a branch",
				}),
			};
		if (await ctx.git.hasUncommittedChanges(ctx.repo.root))
			return failure(
				"dirty_current_worktree",
				`Current worktree at ${ctx.repo.root} has uncommitted changes. Commit or stash before claiming its branch into a slot.`,
			);
		return okPlan({
			target,
			slotCheckoutBranch: branchName,
			source: null,
			isAlreadyCurrent: false,
			callerRedirect:
				branchName === trunkBranch
					? { action: { type: "detach_head", ref: branchName }, note: null }
					: await planCurrentWtRedirect(ctx.git, {
							cwd: ctx.repo.root,
							movingBranch: branchName,
						}),
			mainRedirect: null,
		});
	}

	const occupancy = findOccupancyByBranch(inventory, branchName);
	if (occupancy !== null) return failure("branch_in_use", branchOccupancyMessage(occupancy));
	const target = await lowestAvailable(inventory, ctx.git);
	if (target === null)
		return {
			type: "failure",
			failure: poolFullFailure(assignedSlotRecords(inventory.records), {
				action: "claiming a branch",
			}),
		};
	return okPlan({
		target,
		slotCheckoutBranch: branchName,
		source: null,
		isAlreadyCurrent: false,
		callerRedirect: null,
		mainRedirect: null,
	});
}

async function planTrunkClaimFromMainWorktree(
	ctx: RepoSlotContext,
	inventory: SlotInventory,
	trunkBranch: string,
): Promise<LifecycleResult<ClaimPlan> | null> {
	const currentBranch = await ctx.git.getCurrentBranch(ctx.repo.root);
	if (currentBranch.type === "failure")
		return failure(
			"current_branch_failed",
			`Failed to determine current branch at ${ctx.repo.root}: ${currentBranch.failure.message}`,
		);
	if (currentBranch.type === "detached") return null;
	if (currentBranch.branch === trunkBranch) return null;
	if (await ctx.git.hasUncommittedChanges(ctx.repo.root))
		return failure(
			"dirty_current_worktree",
			`Current worktree at ${ctx.repo.root} has uncommitted changes. Commit or stash before claiming its branch into a slot.`,
		);
	if (!(await ctx.git.branchExists(currentBranch.branch)))
		return failure(
			"branch_missing",
			`Current branch '${currentBranch.branch}' does not exist locally.`,
		);

	let source: SlotRecord | null = null;
	let target: SlotRecord | null = null;
	const match = findByBranch(inventory, trunkBranch);
	if (match?.kind === "slot") {
		const sourceFailure = await sourceSlotFailure(ctx, match.record);
		if (sourceFailure !== null) return { type: "failure", failure: sourceFailure };
		source = match.record;
		target = match.record;
	} else {
		if (match?.kind === "main" && match.worktree.path !== ctx.repo.root)
			return failure(
				"branch_in_main_worktree",
				`Branch '${trunkBranch}' is checked out in the main worktree at ${match.worktree.path}. Run \`slot claim\` from that worktree to move it into a slot.`,
			);
		const occupancy = findOccupancyByBranch(inventory, trunkBranch);
		if (occupancy !== null && occupancy.path !== ctx.repo.root)
			return failure("branch_in_use", branchOccupancyMessage(occupancy));
		target = await lowestAvailable(inventory, ctx.git);
		if (target === null)
			return {
				type: "failure",
				failure: poolFullFailure(assignedSlotRecords(inventory.records), {
					action: "claiming a branch",
				}),
			};
	}
	return okPlan({
		target,
		slotCheckoutBranch: currentBranch.branch,
		source,
		isAlreadyCurrent: false,
		callerRedirect: null,
		mainRedirect: {
			action: { type: "checkout_branch", branch: trunkBranch, role: "trunk" },
			note: null,
		},
	});
}

function currentSlotRecord(records: readonly SlotRecord[], root: string): SlotRecord | null {
	return records.find((record) => record.path === root) ?? null;
}

function notCurrentSlotFailure(ctx: RepoSlotContext): LifecycleResult<ClaimPlan> {
	return failure(
		"not_current_slot",
		`\`slot claim\` must be run from a managed slot worktree, or from the main worktree to move or claim a branch into the lowest available slot (current worktree: ${ctx.repo.root}).`,
	);
}

async function currentSlotDirtyFailure(
	ctx: RepoSlotContext,
	current: SlotRecord,
): Promise<SlotLifecycleFailure | null> {
	if (!(await ctx.git.hasUncommittedChanges(current.path))) return null;
	return {
		error_type: "dirty_current_slot",
		message: `Current slot ${current.slotName} has uncommitted changes at ${current.path}. Commit or stash before claiming a branch.`,
	};
}

async function sourceSlotFailure(
	ctx: RepoSlotContext,
	source: SlotRecord,
): Promise<SlotLifecycleFailure | null> {
	if (source.operation !== null)
		return {
			error_type: "branch_in_use",
			message: slotOperationMessage(source, { action: "claiming" }),
		};
	if (!(await ctx.git.hasUncommittedChanges(source.path))) return null;
	return {
		error_type: "dirty_source_slot",
		message: `Source slot ${source.slotName} has uncommitted changes at ${source.path}. Commit or stash there before claiming its branch.`,
	};
}

async function detachSourceSlot(
	ctx: RepoSlotContext,
	source: SlotRecord,
	branchName: string,
	trunkBranch: string,
): Promise<SlotLifecycleFailure | null> {
	const detachFailure = await ctx.git.detachHead(source.path, trunkBranch);
	if (detachFailure === null) return null;
	return {
		error_type: "source_detach_failed",
		message: `Failed to detach source slot ${source.slotName} at ${source.path} from '${branchName}' to ${trunkBranch}: ${detachFailure.message}`,
	};
}

function outcomeFromPlan(ctx: RepoSlotContext, plan: ClaimPlan): SlotClaimOutcome {
	const replacedBranchName =
		plan.target.branch === plan.slotCheckoutBranch ? null : plan.target.branch;
	const mainRedirect = mainRedirectOf(plan);
	return {
		slot_name: plan.target.slotName,
		branch_name: plan.slotCheckoutBranch,
		worktree_path: plan.target.path,
		replaced_branch_name: replacedBranchName,
		source_slot_name: plan.source?.slotName ?? null,
		source_worktree_path: plan.source?.path ?? null,
		already_current: plan.isAlreadyCurrent,
		main_worktree_path: mainRedirect === null ? null : ctx.repo.root,
		main_checkout_branch: mainCheckoutBranchOf(mainRedirect),
		main_redirect_action: mainRedirect?.action.type ?? null,
		main_redirect_ref: mainRedirectRefOf(mainRedirect),
		main_redirect_note: mainRedirect?.note ?? null,
	};
}

function mainRedirectOf(plan: ClaimPlan): CurrentWorktreeRedirect | null {
	return plan.mainRedirect ?? plan.callerRedirect;
}

function mainCheckoutBranchOf(redirect: CurrentWorktreeRedirect | null): string | null {
	if (redirect?.action.type !== "checkout_branch") return null;
	return redirect.action.branch;
}

function mainRedirectRefOf(redirect: CurrentWorktreeRedirect | null): string | null {
	if (redirect === null) return null;
	if (redirect.action.type === "checkout_branch") return redirect.action.branch;
	return redirect.action.ref;
}

function ok(outcome: SlotClaimOutcome): SlotClaimResult {
	return { type: "ok", outcome };
}

function okPlan(plan: ClaimPlan): LifecycleResult<ClaimPlan> {
	return { type: "ok", outcome: plan };
}

function failure<T = SlotClaimOutcome>(errorType: string, message: string): LifecycleResult<T> {
	return { type: "failure", failure: { error_type: errorType, message } };
}

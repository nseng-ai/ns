import type { RepoSlotContext, SlotCliContext } from "../core/context.ts";
import type { CurrentWorktreeRedirect } from "../core/planning.ts";
import {
	findByBranch,
	findOccupancyByBranch,
	lowestAvailable,
	type SlotInventory,
	type SlotRecord,
	buildSlotInventory,
} from "../core/inventory.ts";
import { planCurrentWtRedirect } from "../core/planning.ts";
import { ensureSlotsMetadataDir } from "../core/repo-context.ts";
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
	slotName: string;
	branchName: string;
	worktreePath: string;
	replacedBranchName: string | null;
	sourceSlotName: string | null;
	sourceWorktreePath: string | null;
	alreadyCurrent: boolean;
	mainWorktreePath: string | null;
	mainCheckoutBranch: string | null;
	mainRedirectAction: "checkout-branch" | "detach-head" | null;
	mainRedirectRef: string | null;
	mainRedirectNote: string | null;
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

interface TrunkSlotResolution {
	target: SlotRecord;
	assignedTrunkSlot: SlotRecord | null;
}

export async function claimBranch(
	ctx: SlotCliContext,
	branchName: string,
): Promise<SlotClaimResult> {
	if (ctx.repo.type !== "repo")
		return {
			type: "failure",
			failure: { errorType: ctx.repo.errorType, message: ctx.repo.message },
		};
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	await ensureSlotsMetadataDir(repoCtx.repo, repoCtx.storage);
	if (!(await repoCtx.git.branchExists(branchName)))
		return failure("branch-missing", `Branch '${branchName}' does not exist locally.`);

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
			"checkout-failed",
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
		return failure("pool-empty", "No managed slots configured. Run `slot init --size N` first.");
	const current = currentSlotRecord(inventory.records, ctx.repo.root);
	if (current === null) return await planClaimFromMainWorktree(ctx, inventory, branchName);
	if (current.operation !== null)
		return failure(
			"operation-in-progress",
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
			"branch-in-main-worktree",
			`Branch '${branchName}' is checked out in the main worktree at ${match.worktree.path}; \`slot claim\` only moves branches from other slots.`,
		);

	const occupancy = findOccupancyByBranch(inventory, branchName);
	if (occupancy !== null) return failure("branch-in-use", branchOccupancyMessage(occupancy));
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
			return failure("branch-in-use", slotOperationMessage(match.record, { action: "claiming" }));
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
				"branch-in-main-worktree",
				`Branch '${branchName}' is checked out in the main worktree at ${match.worktree.path}. Run \`slot claim\` from that worktree to move it into a slot.`,
			);
		const currentBranch = await ctx.git.getCurrentBranch(ctx.repo.root);
		if (currentBranch.type === "failure")
			return failure(
				"current-branch-failed",
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
		const dirtyFailure = await currentWorktreeDirtyFailure(ctx);
		if (dirtyFailure !== null) return { type: "failure", failure: dirtyFailure };
		return okPlan({
			target,
			slotCheckoutBranch: branchName,
			source: null,
			isAlreadyCurrent: false,
			callerRedirect:
				branchName === trunkBranch
					? { action: { type: "detach-head", ref: branchName }, note: null }
					: await planCurrentWtRedirect(ctx.git, {
							cwd: ctx.repo.root,
							movingBranch: branchName,
						}),
			mainRedirect: null,
		});
	}

	const occupancy = findOccupancyByBranch(inventory, branchName);
	if (occupancy !== null) return failure("branch-in-use", branchOccupancyMessage(occupancy));
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
			"current-branch-failed",
			`Failed to determine current branch at ${ctx.repo.root}: ${currentBranch.failure.message}`,
		);
	if (currentBranch.type === "detached") return null;
	const dirtyFailure = await currentWorktreeDirtyFailure(ctx);
	if (dirtyFailure !== null) return { type: "failure", failure: dirtyFailure };
	const isTrunkCurrent = currentBranch.branch === trunkBranch;
	if (!isTrunkCurrent && !(await ctx.git.branchExists(currentBranch.branch)))
		return failure(
			"branch-missing",
			`Current branch '${currentBranch.branch}' does not exist locally.`,
		);

	const resolution = await resolveTrunkSlotForMainClaim(ctx, inventory, trunkBranch);
	if (resolution.type === "failure") return resolution;
	return okPlan({
		target: resolution.outcome.target,
		slotCheckoutBranch: isTrunkCurrent ? trunkBranch : currentBranch.branch,
		source: isTrunkCurrent ? null : resolution.outcome.assignedTrunkSlot,
		isAlreadyCurrent: false,
		callerRedirect: null,
		mainRedirect: isTrunkCurrent
			? { action: { type: "detach-head", ref: trunkBranch }, note: null }
			: {
					action: { type: "checkout-branch", branch: trunkBranch, role: "trunk" },
					note: null,
				},
	});
}

async function resolveTrunkSlotForMainClaim(
	ctx: RepoSlotContext,
	inventory: SlotInventory,
	trunkBranch: string,
): Promise<LifecycleResult<TrunkSlotResolution>> {
	const match = findByBranch(inventory, trunkBranch);
	if (match?.kind === "slot") {
		const sourceFailure = await sourceSlotFailure(ctx, match.record);
		if (sourceFailure !== null) return { type: "failure", failure: sourceFailure };
		return {
			type: "ok",
			outcome: {
				target: match.record,
				assignedTrunkSlot: match.record,
			},
		};
	}
	if (match?.kind === "main" && match.worktree.path !== ctx.repo.root)
		return failure(
			"branch-in-main-worktree",
			`Branch '${trunkBranch}' is checked out in the main worktree at ${match.worktree.path}. Run \`slot claim\` from that worktree to move it into a slot.`,
		);
	const occupancy = findOccupancyByBranch(inventory, trunkBranch);
	if (occupancy !== null && occupancy.path !== ctx.repo.root)
		return failure("branch-in-use", branchOccupancyMessage(occupancy));
	const target = await lowestAvailable(inventory, ctx.git);
	if (target === null)
		return {
			type: "failure",
			failure: poolFullFailure(assignedSlotRecords(inventory.records), {
				action: "claiming a branch",
			}),
		};
	return { type: "ok", outcome: { target, assignedTrunkSlot: null } };
}

function currentSlotRecord(records: readonly SlotRecord[], root: string): SlotRecord | null {
	return records.find((record) => record.path === root) ?? null;
}

function notCurrentSlotFailure(ctx: RepoSlotContext): LifecycleResult<ClaimPlan> {
	return failure(
		"not-current-slot",
		`\`slot claim\` must be run from a managed slot worktree, or from the main worktree to move or claim a branch into the lowest available slot (current worktree: ${ctx.repo.root}).`,
	);
}

async function currentSlotDirtyFailure(
	ctx: RepoSlotContext,
	current: SlotRecord,
): Promise<SlotLifecycleFailure | null> {
	if (!(await ctx.git.hasUncommittedChanges(current.path))) return null;
	return {
		errorType: "dirty-current-slot",
		message: `Current slot ${current.slotName} has uncommitted changes at ${current.path}. Commit or stash before claiming a branch.`,
	};
}

async function currentWorktreeDirtyFailure(
	ctx: RepoSlotContext,
): Promise<SlotLifecycleFailure | null> {
	if (!(await ctx.git.hasUncommittedChanges(ctx.repo.root))) return null;
	return {
		errorType: "dirty-current-worktree",
		message: `Current worktree at ${ctx.repo.root} has uncommitted changes. Commit or stash before claiming its branch into a slot.`,
	};
}

async function sourceSlotFailure(
	ctx: RepoSlotContext,
	source: SlotRecord,
): Promise<SlotLifecycleFailure | null> {
	if (source.operation !== null)
		return {
			errorType: "branch-in-use",
			message: slotOperationMessage(source, { action: "claiming" }),
		};
	if (!(await ctx.git.hasUncommittedChanges(source.path))) return null;
	return {
		errorType: "dirty-source-slot",
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
		errorType: "source-detach-failed",
		message: `Failed to detach source slot ${source.slotName} at ${source.path} from '${branchName}' to ${trunkBranch}: ${detachFailure.message}`,
	};
}

function outcomeFromPlan(ctx: RepoSlotContext, plan: ClaimPlan): SlotClaimOutcome {
	const replacedBranchName =
		plan.target.branch === plan.slotCheckoutBranch ? null : plan.target.branch;
	const mainRedirect = mainRedirectOf(plan);
	return {
		slotName: plan.target.slotName,
		branchName: plan.slotCheckoutBranch,
		worktreePath: plan.target.path,
		replacedBranchName: replacedBranchName,
		sourceSlotName: plan.source?.slotName ?? null,
		sourceWorktreePath: plan.source?.path ?? null,
		alreadyCurrent: plan.isAlreadyCurrent,
		mainWorktreePath: mainRedirect === null ? null : ctx.repo.root,
		mainCheckoutBranch: mainCheckoutBranchOf(mainRedirect),
		mainRedirectAction: mainRedirect?.action.type ?? null,
		mainRedirectRef: mainRedirectRefOf(mainRedirect),
		mainRedirectNote: mainRedirect?.note ?? null,
	};
}

function mainRedirectOf(plan: ClaimPlan): CurrentWorktreeRedirect | null {
	return plan.mainRedirect ?? plan.callerRedirect;
}

function mainCheckoutBranchOf(redirect: CurrentWorktreeRedirect | null): string | null {
	if (redirect?.action.type !== "checkout-branch") return null;
	return redirect.action.branch;
}

function mainRedirectRefOf(redirect: CurrentWorktreeRedirect | null): string | null {
	if (redirect === null) return null;
	if (redirect.action.type === "checkout-branch") return redirect.action.branch;
	return redirect.action.ref;
}

function ok(outcome: SlotClaimOutcome): SlotClaimResult {
	return { type: "ok", outcome };
}

function okPlan(plan: ClaimPlan): LifecycleResult<ClaimPlan> {
	return { type: "ok", outcome: plan };
}

function failure<T = SlotClaimOutcome>(errorType: string, message: string): LifecycleResult<T> {
	return { type: "failure", failure: { errorType: errorType, message } };
}

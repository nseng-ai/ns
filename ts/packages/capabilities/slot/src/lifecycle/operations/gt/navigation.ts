import { basename } from "node:path";

import { failure, type ClinkrFailureExit, type RenderCapabilities } from "@nseng-ai/clinkr";

import type { SlotCliContext } from "../../../core/context.ts";
import { findByBranch, buildSlotInventory } from "../../../core/inventory.ts";
import { checkoutBranch } from "../../checkout.ts";
import { prepareNavigation, type NavigationResultFields } from "../../../core/navigation-result.ts";
import { renderSlotNavigationSuccess } from "../../../core/navigation-presentation.ts";
import { extractSlotNumber } from "../../../core/naming.ts";

export type GtNavigationResult = {
	slotName: string | null;
	branchName: string;
	alreadyAssigned: boolean;
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
	if (result.type === "failure") return failure(result.failure.errorType, result.failure.message);
	return {
		type: "ok",
		resolution: {
			target: {
				slotName: result.outcome.slotName.length === 0 ? null : result.outcome.slotName,
				branchName: result.outcome.branchName,
				worktreePath: result.outcome.worktreePath,
			},
			isAlreadyAssigned: result.outcome.alreadyAssigned,
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
		slotName: resolution.target.slotName,
		branchName: resolution.target.branchName,
		alreadyAssigned: resolution.isAlreadyAssigned,
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
	if (result.slotName === null)
		return `${result.branchName} is checked out at ${result.worktreePath}`;
	if (result.alreadyAssigned) return `${result.slotName} -> ${result.branchName}`;
	return `Checked out ${result.slotName} -> ${result.branchName}`;
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

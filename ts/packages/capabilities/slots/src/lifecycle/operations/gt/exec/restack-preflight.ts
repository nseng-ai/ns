import { failure, negative, ok } from "@nseng-ai/clinkr";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { SlotCliContext } from "../../../../core/context.ts";
import { buildSlotInventory, type SlotInventory } from "../../../../core/inventory.ts";
import { collectStackBranches } from "../stack-walk.ts";
import {
	collectScopedSlotConflicts,
	isRebaseOperation,
	scopedSlotConflictSchema,
	type ScopedSlotConflict,
} from "./scoped-slot-conflicts.ts";
import { validateStackIntegrity } from "./stack-integrity.ts";

const gtRestackPreflightScopeSchema = z.enum(["downstack", "full"]);

export const gtRestackPreflightRequestSchema = z.object({
	scope: gtRestackPreflightScopeSchema
		.default("downstack")
		.describe("Inspect downstack branches by default, or the full linear stack."),
});

export const gtRestackPreflightResultSchema = z.object({
	clean: z.boolean(),
	tracked: z
		.boolean()
		.describe(
			"False when the current branch is not tracked by Graphite; topology fields use safe defaults.",
		),
	rebaseInProgress: z.boolean(),
	hasUpstackChildren: z.boolean(),
	requestedScope: gtRestackPreflightScopeSchema,
	effectiveScope: gtRestackPreflightScopeSchema,
	branches: z.array(z.string()).describe("In-scope branches, bottom-to-top, including current."),
	slotConflicts: z.array(scopedSlotConflictSchema),
	warnings: z.array(z.string()),
});

export type GtRestackPreflightRequest = z.infer<typeof gtRestackPreflightRequestSchema>;
export type GtRestackPreflightResult = z.infer<typeof gtRestackPreflightResultSchema>;

export async function runGtRestackPreflight(
	ctx: SlotCliContext,
	request: GtRestackPreflightRequest,
) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);

	const inspection = await inspectRepository(ctx, ctx.repo.mainRepoRoot);
	if (inspection.type === "failure")
		return failure("git-inspection-failed", inspection.message, {
			operation: inspection.operation,
		});

	const currentResult = await ctx.git.getCurrentBranch(ctx.repo.root);
	if (currentResult.type === "failure")
		return failure("git-current-branch-failed", currentResult.failure.message);
	const currentBranch =
		currentResult.type === "branch"
			? currentResult.branch
			: findCurrentRebaseBranch(inspection.inventory, ctx.repo.root);
	if (currentBranch === null)
		return failure(
			"detached-head",
			`HEAD at ${ctx.repo.root} is detached. Check out a branch first.`,
		);
	const stackResult = await ctx.gt.stackForBranch(ctx.repo.root, currentBranch);
	if (stackResult.type === "failure")
		return failure("gt-stack-read-failed", stackResult.failure.message);
	if (stackResult.type === "untracked_branch") {
		const result = buildUntrackedResult({
			request,
			currentBranch,
			clean: inspection.clean,
			inventory: inspection.inventory,
			currentPath: ctx.repo.root,
		});
		return negative(`${stackResult.message} — run \`gt track\` first`, { data: result });
	}

	const stack = stackResult.stack;
	if (stack.current === stack.trunk) {
		const result: GtRestackPreflightResult = {
			clean: inspection.clean,
			tracked: true,
			rebaseInProgress: false,
			hasUpstackChildren: false,
			requestedScope: request.scope,
			effectiveScope: "downstack",
			branches: [],
			slotConflicts: [],
			warnings: [],
		};
		return negative(`On trunk '${stack.trunk}'; no stack is checked out.`, { data: result });
	}
	const hasUpstackChildren = stack.descendants.length > 0;
	const effectiveScope =
		request.scope === "downstack" || !hasUpstackChildren ? "downstack" : "full";
	const integrity = validateStackIntegrity(stack, {
		downstack: effectiveScope === "downstack",
		forkHint: "--scope downstack",
	});
	if (integrity.type === "failure") return failure(integrity.errorType, integrity.message);
	if (ctx.shouldWriteCdDirective) {
		for (const warning of integrity.warnings) ctx.stderr(`${warning}\n`);
	}
	const branches = collectStackBranches(stack, {
		current: stack.current,
		trunk: stack.trunk,
		isDownstackOnly: effectiveScope === "downstack",
		shouldIncludeCurrent: true,
	});
	const slotConflicts = collectScopedSlotConflicts({
		occupancies: inspection.inventory.branchOccupancies,
		records: inspection.inventory.records,
		branches,
		currentPath: ctx.repo.root,
	});
	const rebaseInProgress = hasCurrentRebase(slotConflicts, stack.current, ctx.repo.root);
	const result: GtRestackPreflightResult = {
		clean: inspection.clean,
		tracked: true,
		rebaseInProgress,
		hasUpstackChildren,
		requestedScope: request.scope,
		effectiveScope,
		branches: [...branches],
		slotConflicts,
		warnings: [...integrity.warnings],
	};
	if (!result.clean || result.rebaseInProgress || result.slotConflicts.length > 0)
		return negative("Restack preflight is blocked.", { data: result });
	return ok(result);
}

export function renderGtRestackPreflight(result: GtRestackPreflightResult): string {
	return JSON.stringify({
		clean: result.clean,
		tracked: result.tracked,
		effectiveScope: result.effectiveScope,
		slotConflicts: result.slotConflicts,
	});
}

async function inspectRepository(
	ctx: SlotCliContext,
	mainRepoRoot: string,
): Promise<
	| { type: "ok"; clean: boolean; inventory: SlotInventory }
	| { type: "failure"; operation: string; message: string }
> {
	const uncommittedChanges = await ctx.git.hasUncommittedChanges(ctx.cwd);
	if (uncommittedChanges.type === "failure")
		return {
			type: "failure",
			operation: "inspect-worktree-and-slot-inventory",
			message: uncommittedChanges.failure.message,
		};
	try {
		const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot });
		return { type: "ok", clean: !uncommittedChanges.hasUncommittedChanges, inventory };
	} catch (error) {
		return {
			type: "failure",
			operation: "inspect-worktree-and-slot-inventory",
			message: formatErrorMessage(error),
		};
	}
}

function findCurrentRebaseBranch(inventory: SlotInventory, currentPath: string): string | null {
	for (const occupancy of inventory.branchOccupancies) {
		if (
			occupancy.path === currentPath &&
			occupancy.branch !== null &&
			isRebaseOperation(occupancy.operation)
		)
			return occupancy.branch;
	}
	return null;
}

function buildUntrackedResult(options: {
	readonly request: GtRestackPreflightRequest;
	readonly currentBranch: string;
	readonly clean: boolean;
	readonly inventory: SlotInventory;
	readonly currentPath: string;
}): GtRestackPreflightResult {
	const branches = [options.currentBranch];
	const slotConflicts = collectScopedSlotConflicts({
		occupancies: options.inventory.branchOccupancies,
		records: options.inventory.records,
		branches,
		currentPath: options.currentPath,
	});
	return {
		clean: options.clean,
		tracked: false,
		rebaseInProgress: hasCurrentRebase(slotConflicts, options.currentBranch, options.currentPath),
		hasUpstackChildren: false,
		requestedScope: options.request.scope,
		effectiveScope: "downstack",
		branches,
		slotConflicts,
		warnings: [],
	};
}

function hasCurrentRebase(
	conflicts: readonly ScopedSlotConflict[],
	currentBranch: string,
	currentPath: string,
): boolean {
	return conflicts.some(
		(conflict) =>
			conflict.branch === currentBranch &&
			conflict.worktreePath === currentPath &&
			"operation" in conflict &&
			isRebaseOperation(conflict.operation),
	);
}

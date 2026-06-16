import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { buildSlotInventory, findByBranch, type SlotInventory } from "../inventory.ts";
import { resolveCurrent, resolveNum, resolveWt } from "../selectors.ts";
import { cancelledFreeOutcome, dryRunFreeOutcome, executeFreePlan, planFreeSlots, type SlotFreeOutcome } from "../lifecycle/free.ts";
import { SLOT_RELEASE_ALL_CLEANUP_ACTIONS, type SlotFreeCleanupResult } from "../lifecycle/release-cleanup.ts";
import type { FreedSlot } from "../lifecycle/release-target.ts";

export const freeCleanupResultSchema = z.object({
	slot_name: z.string(),
	branch_name: z.string(),
	action: z.union([z.literal("pr"), z.literal("local_branch")]),
	status: z.union([z.literal("planned"), z.literal("success"), z.literal("skipped"), z.literal("error")]),
	pr_number: z.number().int().nullable(),
	message: z.string().nullable(),
});

export const freedSlotSchema = z.object({
	slot_name: z.string(),
	branch_name: z.string(),
	worktree_path: z.string(),
});

export const freeRequestSchema = z.object({
	num: z.array(z.string()).default([]).describe("Slot number to free; may be passed multiple times."),
	wt: z.array(z.string()).default([]).describe("Slot worktree name to free; may be passed multiple times."),
	branch: z.array(z.string()).default([]).describe("Branch checked out in a managed slot to free; may be passed multiple times."),
	current: z.boolean().default(false).describe("Free the current slot worktree."),
	all: z.boolean().default(false).describe("Also close the matching PR and delete the local branch."),
	dry_run: z.boolean().default(false).describe("Preview without mutating."),
	yes: z.boolean().default(false).describe("Skip confirmation for destructive cleanup."),
});

export const freeResultSchema = z.object({
	freed: z.array(freedSlotSchema),
	would_free: z.array(freedSlotSchema),
	cleanup: z.array(freeCleanupResultSchema),
	skipped: z.array(z.string()),
	dry_run: z.boolean(),
	cancelled: z.boolean(),
	cleanup_error_count: z.number().int().nonnegative(),
});

export type FreeRequest = z.infer<typeof freeRequestSchema>;
export type FreeResult = z.infer<typeof freeResultSchema>;

export async function runFree(ctx: SlotCliContext, request: FreeRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	if (inventory.records.length === 0) return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	if (request.num.length === 0 && request.wt.length === 0 && request.branch.length === 0 && !request.current) {
		return failure("missing_slot_arg", "Pass at least one slot selector (-n/--num, -w/--wt, -b/--branch, -c/--current) or --all.");
	}
	const resolved = resolveFreeSelectors(ctx, request, inventory);
	if (resolved.errors.length > 0 && resolved.slotNames.length === 0) return failure("invalid_slot_args", resolved.errors.join("\n"));
	const cleanupActions = request.all ? SLOT_RELEASE_ALL_CLEANUP_ACTIONS : [];
	const planResult = await planFreeSlots(ctx, resolved.slotNames, { preflightErrors: resolved.errors, skipped: resolved.skipped, cleanupActions });
	if (planResult.type === "failure") return failure(planResult.failure.error_type, planResult.failure.message);
	const plan = planResult.outcome;
	if (request.dry_run) return ok(dryRunFreeOutcome(plan));
	if (request.all && plan.targets.length > 0 && !request.yes) {
		if (!ctx.shouldWriteCdDirective) return failure("confirmation_required", "Destructive cleanup requires --yes in JSON mode (or use --dry-run first).");
		ctx.stderr(`${renderCleanupPreview(plan.targets, plan.cleanup)}\n`);
		const confirmed = await confirmFromStdin(ctx, "Free " + plan.targets.length + " slot(s) and run cleanup? [y/N]: ", false);
		if (!confirmed) return ok(cancelledFreeOutcome(plan));
	}
	const executed = await executeFreePlan(ctx, plan, { cleanupActions });
	if (executed.type === "failure") return failure(executed.failure.error_type, executed.failure.message);
	if (executed.outcome.cleanup_error_count > 0) return negative("Cleanup failed for one or more released slots.", executed.outcome);
	return ok(executed.outcome);
}

export function renderFree(result: FreeResult): string {
	if (result.cancelled) return "Cancelled; no changes made.";
	const lines: string[] = [...result.skipped];
	for (const slot of result.would_free) lines.push(`Would free ${slot.slot_name} (${slot.branch_name})`);
	for (const slot of result.freed) lines.push(`Freed ${slot.slot_name} (${slot.branch_name})`);
	for (const cleanup of result.cleanup) lines.push(renderCleanupResult(cleanup));
	if (result.dry_run) lines.push("No changes made.");
	if (result.cleanup_error_count > 0) lines.push(`Cleanup errors: ${result.cleanup_error_count}`);
	return lines.length === 0 ? "No slots freed." : lines.join("\n");
}

function resolveFreeSelectors(ctx: SlotCliContext, request: FreeRequest, inventory: SlotInventory): { slotNames: readonly string[]; errors: readonly string[]; skipped: readonly string[] } {
	const slotNames: string[] = [];
	const errors: string[] = [];
	const skipped: string[] = [];
	const add = (slotName: string): void => {
		if (!slotNames.includes(slotName)) slotNames.push(slotName);
	};
	for (const num of request.num) {
		const parsed = Number(num);
		if (!Number.isInteger(parsed)) {
			errors.push(`--num must be an integer (got ${num}).`);
			continue;
		}
		const result = resolveNum(parsed, inventory.records.length);
		if (result.type === "ok") add(result.slotName);
		else errors.push(result.message);
	}
	for (const wt of request.wt) {
		const result = resolveWt(wt);
		if (result.type === "ok") add(result.slotName);
		else errors.push(result.message);
	}
	for (const branch of request.branch) {
		const match = findByBranchSelector(inventory, branch);
		if (match.type === "slot") add(match.slotName);
		else skipped.push(match.message);
	}
	if (request.current) {
		const result = resolveCurrent(ctx.repo.type === "repo" ? ctx.repo.root : ctx.cwd);
		if (result.type === "ok") add(result.slotName);
		else errors.push(result.message);
	}
	return { slotNames, errors, skipped };
}

function findByBranchSelector(inventory: SlotInventory, branch: string): { type: "slot"; slotName: string } | { type: "skipped"; message: string } {
	const match = findByBranch(inventory, branch);
	if (match?.kind === "slot") return { type: "slot", slotName: match.record.slotName };
	if (match?.kind === "main") return { type: "skipped", message: `Branch ${branch} is checked out in the main worktree, not a managed slot; nothing to free.` };
	return { type: "skipped", message: `Branch ${branch} is not checked out in a managed slot; nothing to free.` };
}

async function confirmFromStdin(ctx: SlotCliContext, prompt: string, defaultYes: boolean): Promise<boolean> {
	ctx.stderr(prompt);
	const input = await ctx.stdin();
	for (const rawLine of input.split(/\r?\n/)) {
		const value = rawLine.trim().toLowerCase();
		if (value === "y" || value === "yes") return true;
		if (value === "n" || value === "no") return false;
		if (value === "") return defaultYes;
		ctx.stderr("Error: invalid input\n");
		ctx.stderr(prompt);
	}
	return false;
}

function renderCleanupPreview(targets: readonly FreedSlot[], cleanup: readonly SlotFreeCleanupResult[]): string {
	const lines = [`Cleanup will run for ${targets.length} slot(s):`];
	for (const item of cleanup) lines.push(renderCleanupResult(item));
	return lines.join("\n");
}

function renderCleanupResult(cleanup: SlotFreeCleanupResult): string {
	const subject = cleanup.action === "pr" ? `PR${cleanup.pr_number === null ? "" : ` #${cleanup.pr_number}`}` : "local branch";
	const message = cleanup.message === null ? "" : `: ${cleanup.message}`;
	return `${cleanup.slot_name} ${subject} ${cleanup.status}${message}`;
}

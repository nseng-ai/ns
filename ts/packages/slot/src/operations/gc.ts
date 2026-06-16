import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { executeGcPlan, outcomeFromGcPlan, planGc, planGcCleanup, type SlotGcOutcome } from "../lifecycle/gc.ts";
import { freeCleanupResultSchema } from "./free.ts";
import { SLOT_GC_DELETE_BRANCH_CLEANUP_ACTIONS } from "../lifecycle/release-cleanup.ts";

const gcActionSchema = z.union([
	z.literal("freed"),
	z.literal("would_free"),
	z.literal("kept_open_pr"),
	z.literal("kept_no_pr"),
	z.literal("skipped_dirty"),
	z.literal("skipped_operation"),
	z.literal("error"),
]);

export const gcRequestSchema = z.object({
	dry_run: z.boolean().default(false).describe("Preview without freeing."),
	force: z.boolean().default(false).describe("Free without prompting."),
	delete_branches: z.boolean().default(false).describe("Delete local branches for successfully freed slots."),
});

export const gcEntrySchema = z.object({
	slot_name: z.string(),
	branch_name: z.string(),
	worktree_path: z.string(),
	action: gcActionSchema,
	pr_number: z.number().int().nullable(),
	pr_state: z.string().nullable(),
	pr_url: z.string().nullable(),
	message: z.string().nullable(),
	cleanup: z.array(freeCleanupResultSchema),
});

export const gcResultSchema = z.object({
	entries: z.array(gcEntrySchema),
	freed_count: z.number().int().nonnegative(),
	kept_count: z.number().int().nonnegative(),
	skipped_count: z.number().int().nonnegative(),
	error_count: z.number().int().nonnegative(),
	cleanup_error_count: z.number().int().nonnegative(),
	dry_run: z.boolean(),
	cancelled: z.boolean(),
});

export type GcRequest = z.infer<typeof gcRequestSchema>;
export type GcResult = z.infer<typeof gcResultSchema>;

export async function runGc(ctx: SlotCliContext, request: GcRequest) {
	if (request.dry_run && request.force) return failure("conflicting_flags", "--dry-run and --force are mutually exclusive.");
	const planResult = await planGc(ctx);
	if (planResult.type === "failure") return failure(planResult.failure.error_type, planResult.failure.message);
	const cleanupActions = request.delete_branches ? SLOT_GC_DELETE_BRANCH_CLEANUP_ACTIONS : [];
	const plan = await planGcCleanup(ctx, planResult.outcome, cleanupActions);
	const preview = outcomeFromGcPlan(plan, { dryRun: request.dry_run, cancelled: false });
	const wouldFreeCount = plan.entries.filter((entry) => entry.action === "would_free").length;
	if (request.dry_run || wouldFreeCount === 0) return ok(preview);
	if (!request.force) {
		ctx.stderr(`${renderGc(preview)}\n`);
		const prompt = request.delete_branches ? `Free ${wouldFreeCount} slot(s) and delete local branches? [Y/n]: ` : `Free ${wouldFreeCount} slot(s)? [Y/n]: `;
		const confirmed = await confirmFromStdin(ctx, prompt, true);
		if (!confirmed) return ok({ ...preview, entries: preview.entries, freed_count: 0, dry_run: false, cancelled: true } satisfies SlotGcOutcome);
	}
	const executed = await executeGcPlan(ctx, plan, { cleanupActions });
	if (executed.type === "failure") return failure(executed.failure.error_type, executed.failure.message);
	if (executed.outcome.cleanup_error_count > 0) return negative("Cleanup failed for one or more freed slots.", executed.outcome);
	return ok(executed.outcome);
}

export function renderGc(result: GcResult): string {
	if (result.cancelled) return "Cancelled; no changes made.";
	const lines: string[] = [];
	for (const entry of result.entries) {
		const pr = entry.pr_number === null ? "" : ` PR #${entry.pr_number}`;
		const message = entry.message === null ? "" : `: ${entry.message}`;
		lines.push(`${entry.action.replaceAll("_", " ")} ${entry.slot_name} (${entry.branch_name})${pr}${message}`);
		for (const cleanup of entry.cleanup) {
			const cleanupMessage = cleanup.message === null ? "" : `: ${cleanup.message}`;
			lines.push(`  ${cleanup.action} ${cleanup.status}${cleanupMessage}`);
		}
	}
	lines.push(`freed ${result.freed_count}; kept ${result.kept_count}; skipped ${result.skipped_count}; errors ${result.error_count}`);
	if (result.cleanup_error_count > 0) lines.push(`cleanup errors ${result.cleanup_error_count}`);
	return lines.join("\n");
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

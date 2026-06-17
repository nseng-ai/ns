import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../context.ts";
import { outcomeFromGcPlan, planGc, planGcCleanup, executeGcPlan, type SlotGcOutcome } from "../lifecycle/gc.ts";
import type { SlotFreeCleanupAction } from "../lifecycle/release-cleanup.ts";
import { renderCleanupLines } from "./cleanup-rendering.ts";
import { confirmFromStdin } from "./confirmation.ts";

const cleanupSchema = z.object({ slot_name: z.string(), branch_name: z.string(), action: z.union([z.literal("pr"), z.literal("local_branch")]), status: z.union([z.literal("planned"), z.literal("success"), z.literal("skipped"), z.literal("error")]), pr_number: z.number().int().nullable(), message: z.string().nullable() });
const gcEntrySchema = z.object({
	slot_name: z.string(),
	branch_name: z.string(),
	worktree_path: z.string(),
	action: z.union([z.literal("freed"), z.literal("would_free"), z.literal("kept_open_pr"), z.literal("kept_no_pr"), z.literal("skipped_dirty"), z.literal("skipped_operation"), z.literal("error")]),
	pr_number: z.number().int().nullable(),
	pr_state: z.union([z.literal("OPEN"), z.literal("CLOSED"), z.literal("MERGED")]).nullable(),
	pr_url: z.string().nullable(),
	message: z.string().nullable(),
	cleanup: z.array(cleanupSchema),
});

export const gcRequestSchema = z.object({
	dry_run: z.boolean().default(false).describe("Preview without mutating."),
	force: z.boolean().default(false).describe("Free candidates without prompting."),
	delete_branches: z.boolean().default(false).describe("Delete local branches for freed slots."),
});

export const gcResultSchema = z.object({
	entries: z.array(gcEntrySchema),
	freed_count: z.number().int(),
	kept_count: z.number().int(),
	skipped_count: z.number().int(),
	error_count: z.number().int(),
	dry_run: z.boolean(),
	cleanup_error_count: z.number().int(),
	cancelled: z.boolean().optional(),
});

export type GcRequest = z.infer<typeof gcRequestSchema>;
export type GcResult = z.infer<typeof gcResultSchema>;

export async function runGc(ctx: SlotCliContext, request: GcRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	if (request.dry_run && request.force) return failure("conflicting_flags", "--dry-run and --force cannot be combined.");
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const cleanupActions: readonly SlotFreeCleanupAction[] = request.delete_branches ? ["local_branch"] : [];
	const plan = await planGc(repoCtx);
	if (plan.type === "failure") return failure(plan.failure.error_type, plan.failure.message);
	if (request.dry_run) {
		const cleanup = await planGcCleanup(repoCtx, plan.outcome, cleanupActions);
		return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { dryRun: true, cleanup })));
	}
	if (plan.outcome.would_free_count === 0) return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { dryRun: false })));
	if (!request.force) {
		if (!ctx.shouldWriteCdDirective) return failure("confirmation_required", "Destructive gc requires --force in JSON mode (or use --dry-run first).");
		const accepted = await confirmFromStdin({ stdin: repoCtx.stdin, stderr: repoCtx.stderr, prompt: `Free ${plan.outcome.would_free_count} completed slot(s)? [Y/n]: `, defaultAnswer: "yes" });
		if (typeof accepted !== "string") return accepted;
		if (accepted === "no") return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { dryRun: false }), { cancelled: true }));
	}
	const outcome = await executeGcPlan(repoCtx, plan.outcome, { cleanupActions });
	const result = toGcResult(outcome);
	if (outcome.cleanup_error_count > 0) return negative("Slot gc completed with cleanup errors.", result);
	return ok(result);
}

export function renderGc(result: GcResult): string {
	if (result.cancelled === true) return "Cancelled slot gc.";
	const lines = result.entries.map((entry) => {
		const pr = entry.pr_number === null ? "" : ` PR #${entry.pr_number}`;
		const message = entry.message === null ? "" : ` (${entry.message})`;
		return `${entry.slot_name} -> ${entry.branch_name}: ${entry.action}${pr}${message}`;
	});
	lines.push(...renderCleanupLines(result.entries.flatMap((entry) => entry.cleanup)));
	if (lines.length === 0) return "No assigned slots to garbage collect.";
	return lines.join("\n");
}

function toGcResult(outcome: SlotGcOutcome, options: { cancelled?: boolean | undefined } = {}): GcResult {
	return {
		entries: outcome.entries.map((entry) => ({ ...entry, cleanup: [...entry.cleanup] })),
		freed_count: outcome.freed_count,
		kept_count: outcome.kept_count,
		skipped_count: outcome.skipped_count,
		error_count: outcome.error_count,
		dry_run: outcome.dry_run,
		cleanup_error_count: outcome.cleanup_error_count,
		...(options.cancelled === undefined ? {} : { cancelled: options.cancelled }),
	};
}


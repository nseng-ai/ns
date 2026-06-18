import { confirmFromStdin, failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../context.ts";
import { outcomeFromGcPlan, planGc, planGcCleanup, executeGcPlan, type SlotGcOutcome } from "../lifecycle/gc.ts";
import type { SlotFreeCleanupAction } from "../lifecycle/release-cleanup.ts";
import { cleanupPreviewLine, cleanupResultLine } from "./cleanup-rendering.ts";
import { cleanupSchema } from "./result-schemas.ts";
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
		return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: true, cleanup })));
	}
	if (plan.outcome.would_free_count === 0) return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: false })));
	if (!request.force) {
		if (!ctx.shouldWriteCdDirective) return failure("confirmation_required", "Destructive gc requires --force in JSON mode (or use --dry-run first).");
		const cleanup = await planGcCleanup(repoCtx, plan.outcome, cleanupActions);
		repoCtx.stderr(`${renderGc(toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: true, cleanup })))}\n`);
		const accepted = await confirmFromStdin({ stdin: repoCtx.stdin, stderr: repoCtx.stderr, prompt: confirmationPrompt(plan.outcome.would_free_count, { shouldDeleteBranches: request.delete_branches }), defaultAnswer: "yes" });
		if (typeof accepted !== "string") return accepted;
		if (accepted === "no") return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: false, cleanup }), { isCancelled: true }));
	}
	const outcome = await executeGcPlan(repoCtx, plan.outcome, { cleanupActions });
	const result = toGcResult(outcome);
	if (outcome.cleanup_error_count > 0) return negative("Slot gc completed with cleanup errors.", result);
	return ok(result);
}

export function renderGc(result: GcResult): string {
	if (result.cancelled === true) return ansi("yellow", "Cancelled — no slots freed.");
	if (result.entries.length === 0) return ansi("dim", "No assignments to sweep.");
	const lines: string[] = [];
	for (const entry of result.entries) {
		const pr = entry.pr_number === null ? "" : ` ${ansi("dim", `PR #${entry.pr_number} ${entry.pr_state}`)}`;
		lines.push(`${actionLabel(entry.action)} ${ansi("boldCyan", entry.slot_name)} (${ansi("yellow", entry.branch_name)})${pr}`);
		if (entry.message !== null) lines.push(`    ${ansi("dim", entry.message)}`);
		for (const cleanup of entry.cleanup) lines.push(`    ${result.dry_run ? cleanupPreviewLine(cleanup) : cleanupResultLine(cleanup)}`);
	}
	const verb = result.dry_run ? "Would free" : "Freed";
	let summary = `\n${ansi("bold", `${verb} ${result.freed_count}`)}; kept ${result.kept_count}; skipped ${result.skipped_count}; errors ${result.error_count}`;
	if (result.cleanup_error_count > 0) summary = `${summary}; cleanup errors ${result.cleanup_error_count}`;
	lines.push(summary);
	return lines.join("\n");
}

function actionLabel(action: GcResult["entries"][number]["action"]): string {
	if (action === "freed") return ansi("green", "✓ freed");
	if (action === "would_free") return ansi("yellow", "→ would free");
	if (action === "kept_open_pr") return ansi("blue", "• kept (open PR)");
	if (action === "kept_no_pr") return ansi("dim", "• kept (no PR)");
	if (action === "skipped_dirty") return ansi("yellow", "! skipped (dirty)");
	if (action === "skipped_operation") return ansi("yellow", "! skipped (operation)");
	return ansi("red", "✗ error");
}

type AnsiStyle = "bold" | "dim" | "red" | "green" | "yellow" | "blue" | "boldCyan";

const ANSI_CODES = {
	bold: "1",
	dim: "2",
	red: "31",
	green: "32",
	yellow: "33",
	blue: "34",
	boldCyan: "1;36",
} as const satisfies Record<AnsiStyle, string>;

function ansi(style: AnsiStyle, text: string): string {
	return `\u001b[${ANSI_CODES[style]}m${text}\u001b[0m`;
}

function confirmationPrompt(count: number, options: { shouldDeleteBranches: boolean }): string {
	if (options.shouldDeleteBranches) return `Free ${count} slot(s) and delete local branches? [Y/n]: `;
	return `Free ${count} slot(s)? [Y/n]: `;
}

function toGcResult(outcome: SlotGcOutcome, options: { isCancelled?: boolean | undefined } = {}): GcResult {
	return {
		entries: outcome.entries.map((entry) => ({ ...entry, cleanup: [...entry.cleanup] })),
		freed_count: options.isCancelled === true ? 0 : outcome.freed_count,
		kept_count: outcome.kept_count,
		skipped_count: outcome.skipped_count,
		error_count: outcome.error_count,
		dry_run: outcome.dry_run,
		cleanup_error_count: outcome.cleanup_error_count,
		...(options.isCancelled === undefined ? {} : { cancelled: options.isCancelled }),
	};
}


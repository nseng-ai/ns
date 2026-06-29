import {
	failure,
	negative,
	ok,
	requireInteractiveOrUsageError,
	resolveRenderCapabilities,
	type Caps,
	type RenderCapabilities,
} from "@sdl/clinkr";
import { cell, dim, paint, renderTable } from "@sdl/cli-theme";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../context.ts";
import {
	outcomeFromGcPlan,
	planGc,
	planGcCleanup,
	executeGcPlan,
	type SlotGcOutcome,
} from "../lifecycle/gc.ts";
import type { SlotFreeCleanupAction } from "../lifecycle/release-cleanup.ts";
import { renderCleanupLines } from "./cleanup-rendering.ts";
import { renderSlotDestructiveResultBlock } from "./destructive-presentation.ts";
import { cleanupSchema } from "./result-schemas.ts";
const gcEntrySchema = z.object({
	slot_name: z.string(),
	branch_name: z.string(),
	worktree_path: z.string(),
	action: z.union([
		z.literal("freed"),
		z.literal("would_free"),
		z.literal("kept_open_pr"),
		z.literal("kept_no_pr"),
		z.literal("skipped_dirty"),
		z.literal("skipped_operation"),
		z.literal("error"),
	]),
	pr_number: z.number().int().nullable(),
	pr_state: z.union([z.literal("OPEN"), z.literal("CLOSED"), z.literal("MERGED")]).nullable(),
	pr_url: z.string().nullable(),
	message: z.string().nullable(),
	cleanup: z.array(cleanupSchema),
});

export const gcRequestSchema = z.object({
	dryRun: z.boolean().default(false).describe("Preview without mutating."),
	force: z.boolean().default(false).describe("Free candidates without prompting."),
	deleteBranches: z.boolean().default(false).describe("Delete local branches for freed slots."),
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
	if (request.dryRun && request.force)
		return failure("conflicting_flags", "--dry-run and --force cannot be combined.");
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const cleanupActions: readonly SlotFreeCleanupAction[] = request.deleteBranches
		? ["local_branch"]
		: [];
	const plan = await planGc(repoCtx);
	if (plan.type === "failure") return failure(plan.failure.error_type, plan.failure.message);
	if (request.dryRun) {
		const cleanup = await planGcCleanup(repoCtx, plan.outcome, cleanupActions);
		return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: true, cleanup })));
	}
	if (plan.outcome.would_free_count === 0)
		return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: false })));
	if (!request.force) {
		const gate = requireInteractiveOrUsageError(ctx.interaction, {
			message: "Destructive gc requires --force when non-interactive (or run --dry-run first).",
			missingFlag: "--force",
			howToSupply: "Pass --force (or -f) to free slots without prompting, or run --dry-run first.",
		});
		if (gate) return gate;
		const cleanup = await planGcCleanup(repoCtx, plan.outcome, cleanupActions);
		repoCtx.stderr(
			`${renderGc(toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: true, cleanup })))}\n`,
		);
		const accepted = await repoCtx.interaction.confirm({
			message: confirmationMessage(plan.outcome.would_free_count, {
				shouldDeleteBranches: request.deleteBranches,
			}),
			defaultAnswer: "yes",
		});
		if (accepted.type === "aborted") return failure("aborted", "Aborted!");
		if (accepted.type === "declined")
			return ok(
				toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: false, cleanup }), {
					isCancelled: true,
				}),
			);
	}
	const outcome = await executeGcPlan(repoCtx, plan.outcome, { cleanupActions });
	const result = toGcResult(outcome);
	if (outcome.cleanup_error_count > 0)
		return negative("Slot gc completed with cleanup errors.", {
			data: result,
			human: renderGc(result),
		});
	return ok(result);
}

export function renderGc(
	result: GcResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const resolvedCaps = resolveRenderCapabilities(caps);
	return renderSlotDestructiveResultBlock(caps, {
		kind: gcResultKind(result),
		headline: gcHeadline(result),
		body: renderGcDetails(result, resolvedCaps),
	});
}

function gcResultKind(result: GcResult): "success" | "failure" | "refusal" {
	if (result.cancelled === true) return "refusal";
	if (result.cleanup_error_count > 0 || result.error_count > 0) return "failure";
	return "success";
}

function gcHeadline(result: GcResult): string {
	if (result.cancelled === true) return "Cancelled slot gc.";
	if (result.cleanup_error_count > 0) return "Slot gc completed with cleanup errors.";
	if (result.error_count > 0) return "Slot gc completed with errors.";
	if (result.dry_run) {
		if (result.freed_count === 0) return "No slots would be freed.";
		return `Would free ${result.freed_count} slot(s).`;
	}
	if (result.freed_count === 0) return "No slots freed.";
	return `Freed ${result.freed_count} slot(s).`;
}

function renderGcDetails(result: GcResult, caps: Caps): string | undefined {
	if (result.entries.length === 0) return undefined;
	const tableRows = result.entries.map((entry) => [
		gcActionCell(caps, entry.action),
		cell(paint(caps, "accent", entry.slot_name), entry.slot_name),
		cell(entry.branch_name),
		gcPrCell(caps, entry),
	]);
	const tableLines = renderTable({
		caps,
		columns: [
			{ header: "ACTION", width: "auto" },
			{ header: "SLOT", width: "auto" },
			{ header: "BRANCH", width: "auto" },
			{ header: "PR", width: "auto" },
		],
		rows: tableRows,
	});
	const lines: string[] = [tableLines[0] ?? ""];
	const rowLines = tableLines.slice(1);
	result.entries.forEach((entry, index) => {
		const rowLine = rowLines[index];
		if (rowLine !== undefined) lines.push(rowLine);
		if (entry.message !== null) lines.push(`  ${paint(caps, "muted", "note:")} ${entry.message}`);
		lines.push(...renderGcCleanupDetails(caps, entry, { isDryRun: result.dry_run }));
	});
	lines.push(gcSummaryLine(result));
	return lines.join("\n");
}

function gcActionCell(caps: Caps, action: GcResult["entries"][number]["action"]) {
	const text = gcActionText(action);
	return cell(paint(caps, gcActionIntent(action), text), text);
}

function gcPrCell(caps: Caps, entry: GcResult["entries"][number]) {
	const text = prText(entry);
	if (entry.pr_state === null) return cell(paint(caps, "muted", text), text);
	return cell(paint(caps, prStateIntent(entry.pr_state), text), text);
}

function renderGcCleanupDetails(
	caps: Caps,
	entry: GcResult["entries"][number],
	options: { isDryRun: boolean },
): readonly string[] {
	return renderCleanupLines(entry.cleanup, { isDryRun: options.isDryRun, caps }).map(
		(line) => `  ${paint(caps, "muted", "cleanup:")} ${line}`,
	);
}

function gcSummaryLine(result: GcResult): string {
	const freedLabel = result.dry_run ? "would free" : "freed";
	let summary = `${freedLabel} ${result.freed_count}; kept ${result.kept_count}; skipped ${result.skipped_count}; errors ${result.error_count}`;
	if (result.cleanup_error_count > 0)
		summary = `${summary}; cleanup errors ${result.cleanup_error_count}`;
	return dim(`Summary: ${summary}`);
}

function gcActionText(action: GcResult["entries"][number]["action"]): string {
	switch (action) {
		case "freed":
			return "Freed";
		case "would_free":
			return "Would free";
		case "kept_open_pr":
			return "Kept: open PR";
		case "kept_no_pr":
			return "Kept: no PR";
		case "skipped_dirty":
			return "Skipped: dirty";
		case "skipped_operation":
			return "Skipped: operation";
		case "error":
			return "Error";
	}
}

function gcActionIntent(
	action: GcResult["entries"][number]["action"],
): "success" | "warn" | "error" | "accent" | "muted" {
	switch (action) {
		case "freed":
			return "success";
		case "would_free":
			return "accent";
		case "kept_open_pr":
			return "warn";
		case "kept_no_pr":
		case "skipped_dirty":
		case "skipped_operation":
			return "muted";
		case "error":
			return "error";
	}
}

function prStateIntent(
	state: NonNullable<GcResult["entries"][number]["pr_state"]>,
): "success" | "warn" | "muted" {
	if (state === "OPEN") return "warn";
	if (state === "MERGED") return "success";
	return "muted";
}

function prText(entry: GcResult["entries"][number]): string {
	if (entry.pr_number === null) return "—";
	return `#${entry.pr_number} ${entry.pr_state}`;
}

function confirmationMessage(count: number, options: { shouldDeleteBranches: boolean }): string {
	if (options.shouldDeleteBranches)
		return `Free ${count} merged/closed slot(s) and force-delete their local branches?`;
	return `Free ${count} merged/closed slot(s)?`;
}

function toGcResult(
	outcome: SlotGcOutcome,
	options: { isCancelled?: boolean | undefined } = {},
): GcResult {
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

import {
	failure,
	negative,
	ok,
	requireInteractiveOrUsageError,
	resolveRenderCapabilities,
	type Caps,
	type RenderCapabilities,
} from "@sdl/clinkr";
import { cell, dim, paint, renderTable, stripAnsiWhenDisabled } from "@sdl/core/cli-theme";
import { optionalEntry } from "@sdl/core/primitives";
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
import {
	buildSlotDestructiveResultBlock,
	renderSlotDestructiveResultBlock,
} from "./destructive-presentation.ts";
import { cleanupSchema } from "./result-schemas.ts";
const gcEntrySchema = z.object({
	slotName: z.string(),
	branchName: z.string(),
	worktreePath: z.string(),
	action: z.union([
		z.literal("freed"),
		z.literal("would-free"),
		z.literal("kept-open-pr"),
		z.literal("kept-no-pr"),
		z.literal("skipped-dirty"),
		z.literal("skipped-operation"),
		z.literal("error"),
	]),
	prNumber: z.number().int().nullable(),
	prState: z.union([z.literal("OPEN"), z.literal("CLOSED"), z.literal("MERGED")]).nullable(),
	prUrl: z.string().nullable(),
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
	freedCount: z.number().int(),
	keptCount: z.number().int(),
	skippedCount: z.number().int(),
	errorCount: z.number().int(),
	dryRun: z.boolean(),
	cleanupErrorCount: z.number().int(),
	cancelled: z.boolean().optional(),
});

export type GcRequest = z.infer<typeof gcRequestSchema>;
export type GcResult = z.infer<typeof gcResultSchema>;

export async function runGc(ctx: SlotCliContext, request: GcRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	if (request.dryRun && request.force)
		return failure("conflicting-flags", "--dry-run and --force cannot be combined.");
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const cleanupActions: readonly SlotFreeCleanupAction[] = request.deleteBranches
		? ["local-branch"]
		: [];
	const plan = await planGc(repoCtx);
	if (plan.type === "failure") return failure(plan.failure.errorType, plan.failure.message);
	if (request.dryRun) {
		const cleanup = await planGcCleanup(repoCtx, plan.outcome, cleanupActions);
		return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: true, cleanup })));
	}
	if (plan.outcome.wouldFreeCount === 0)
		return ok(toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: false })));
	if (!request.force) {
		const gate = requireInteractiveOrUsageError(ctx.interaction, {
			message: "Destructive gc requires --force when non-interactive (or run --dry-run first).",
			missingFlag: "--force",
			howToSupply: "Pass --force (or -f) to free slots without prompting, or run --dry-run first.",
		});
		if (gate) return gate;
		const cleanup = await planGcCleanup(repoCtx, plan.outcome, cleanupActions);
		const renderCapabilities = repoCtx.renderCapabilities;
		const preview = renderGc(
			toGcResult(outcomeFromGcPlan(plan.outcome, { isDryRun: true, cleanup })),
			renderCapabilities,
		);
		repoCtx.stderr(`${stripAnsiWhenDisabled(preview, renderCapabilities)}\n`);
		const accepted = await repoCtx.interaction.confirm({
			message: confirmationMessage(plan.outcome.wouldFreeCount, {
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
	if (outcome.cleanupErrorCount > 0)
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
	const body = renderGcDetails(result, resolvedCaps);
	return renderSlotDestructiveResultBlock(
		caps,
		buildSlotDestructiveResultBlock({
			kind: gcResultKind(result),
			headline: gcHeadline(result),
			...optionalEntry("body", body),
		}),
	);
}

function gcResultKind(result: GcResult): "success" | "failure" | "refusal" {
	if (result.cancelled === true) return "refusal";
	if (result.cleanupErrorCount > 0 || result.errorCount > 0) return "failure";
	return "success";
}

function gcHeadline(result: GcResult): string {
	if (result.cancelled === true) return "Cancelled slot gc.";
	if (result.cleanupErrorCount > 0) return "Slot gc completed with cleanup errors.";
	if (result.errorCount > 0) return "Slot gc completed with errors.";
	if (result.dryRun) {
		if (result.freedCount === 0) return "No slots would be freed.";
		return `Would free ${result.freedCount} slot(s).`;
	}
	if (result.freedCount === 0) return "No slots freed.";
	return `Freed ${result.freedCount} slot(s).`;
}

function renderGcDetails(result: GcResult, caps: Caps): string | undefined {
	if (result.entries.length === 0) return undefined;
	const tableRows = result.entries.map((entry) => [
		gcActionCell(caps, entry.action),
		cell(paint(caps, "accent", entry.slotName), entry.slotName),
		cell(entry.branchName),
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
		lines.push(...renderGcCleanupDetails(caps, entry, { isDryRun: result.dryRun }));
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
	if (entry.prState === null) return cell(paint(caps, "muted", text), text);
	return cell(paint(caps, prStateIntent(entry.prState), text), text);
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
	const freedLabel = result.dryRun ? "would free" : "freed";
	let summary = `${freedLabel} ${result.freedCount}; kept ${result.keptCount}; skipped ${result.skippedCount}; errors ${result.errorCount}`;
	if (result.cleanupErrorCount > 0)
		summary = `${summary}; cleanup errors ${result.cleanupErrorCount}`;
	return dim(`Summary: ${summary}`);
}

function gcActionText(action: GcResult["entries"][number]["action"]): string {
	switch (action) {
		case "freed":
			return "Freed";
		case "would-free":
			return "Would free";
		case "kept-open-pr":
			return "Kept: open PR";
		case "kept-no-pr":
			return "Kept: no PR";
		case "skipped-dirty":
			return "Skipped: dirty";
		case "skipped-operation":
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
		case "would-free":
			return "accent";
		case "kept-open-pr":
			return "warn";
		case "kept-no-pr":
		case "skipped-dirty":
		case "skipped-operation":
			return "muted";
		case "error":
			return "error";
	}
}

function prStateIntent(
	state: NonNullable<GcResult["entries"][number]["prState"]>,
): "success" | "warn" | "muted" {
	if (state === "OPEN") return "warn";
	if (state === "MERGED") return "success";
	return "muted";
}

function prText(entry: GcResult["entries"][number]): string {
	if (entry.prNumber === null) return "—";
	return `#${entry.prNumber} ${entry.prState}`;
}

function confirmationMessage(count: number, options: { shouldDeleteBranches: boolean }): string {
	if (options.shouldDeleteBranches)
		return `Free ${count} merged/closed slot(s) and force-delete their local branches?`;
	return `Free ${count} merged/closed slot(s)?`;
}

function toGcResult(outcome: SlotGcOutcome, options: { isCancelled?: boolean } = {}): GcResult {
	return {
		entries: outcome.entries.map((entry) => ({ ...entry, cleanup: [...entry.cleanup] })),
		freedCount: options.isCancelled === true ? 0 : outcome.freedCount,
		keptCount: outcome.keptCount,
		skippedCount: outcome.skippedCount,
		errorCount: outcome.errorCount,
		dryRun: outcome.dryRun,
		cleanupErrorCount: outcome.cleanupErrorCount,
		...optionalEntry("cancelled", options.isCancelled),
	};
}

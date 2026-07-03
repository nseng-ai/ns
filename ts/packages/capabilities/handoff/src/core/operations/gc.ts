import { renderDestructiveResultBlock } from "@ji/core/cli-theme";
import { failure, ok, type RenderCapabilities } from "@ji/clinkr";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { listHandoffSummaries } from "../artifact-storage.ts";
import {
	deletedBranchGarbageCollectionMetadataForAction,
	deletedBranchGarbageCollectionMetadataForWireAction,
	deletedBranchGarbageCollectionWireValues,
	type DeletedBranchGarbageCollectionWireAction,
} from "../gc-actions.ts";
import {
	executeDeletedBranchGarbageCollection,
	planDeletedBranchGarbageCollection,
	type DeletedBranchGarbageCollectionReport,
} from "../gc-core.ts";
import { handoffSummarySchema } from "../inventory.ts";
import { confirmDestructiveAction } from "./shared.ts";

export type GcAction = DeletedBranchGarbageCollectionWireAction;

export const gcActionSchema = z.enum(deletedBranchGarbageCollectionWireValues());

export const gcRequestSchema = z.object({
	dryRun: z.boolean().default(false).describe("Preview deletions without deleting."),
	force: z.boolean().default(false).describe("Delete without prompting."),
});

export const gcResultEntrySchema = handoffSummarySchema.extend({
	action: gcActionSchema,
	commit: z.string().nullable(),
	message: z.string().nullable(),
});

export const gcResultSchema = z.object({
	entries: z.array(gcResultEntrySchema),
	wouldDeleteCount: z.number().int(),
	deletedCount: z.number().int(),
	keptCount: z.number().int(),
	errorCount: z.number().int(),
	dryRun: z.boolean(),
	cancelled: z.boolean(),
});

export type GcRequest = z.infer<typeof gcRequestSchema>;
export type GcResultEntry = z.infer<typeof gcResultEntrySchema>;
export type GcResult = z.infer<typeof gcResultSchema>;

export async function runGc(ctx: HandoffCliContext, request: GcRequest) {
	if (request.dryRun && request.force)
		return failure("conflicting-flags", "--dry-run and --force are mutually exclusive.");
	const summaries = await loadAllSummaries(ctx);
	if (summaries.type !== "resolved") return summaries;

	const plan = planDeletedBranchGarbageCollection({ summaries: summaries.value });
	const preview = toGcResult(plan, { dryRun: request.dryRun, cancelled: false });
	if (request.dryRun || plan.counts.wouldDelete === 0) return ok(preview);
	if (request.force)
		return ok(
			await executeAndFormat(ctx, plan, {
				dryRun: false,
				cancelled: false,
			}),
		);

	const confirmed = await confirmDestructiveAction(ctx, {
		gateMessage: "Deleting handoffs with gc requires --force when non-interactive.",
		missingFlag: "--force",
		howToSupply: "Pass --force (or -f) to delete without prompting, or run --dry-run first.",
		confirmMessage: `Delete ${preview.wouldDeleteCount} handoff(s)?`,
		beforePrompt: () => ctx.stderr(`${renderGc(preview)}\n`),
	});
	if (confirmed.type === "gateFailure") return confirmed.exit;
	if (confirmed.type === "confirmed")
		return ok(
			await executeAndFormat(ctx, plan, {
				dryRun: false,
				cancelled: false,
			}),
		);
	if (confirmed.type === "aborted") return failure("aborted", "Aborted!");
	return ok(toGcResult(plan, { dryRun: false, cancelled: true }));
}

export function renderGc(
	result: GcResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const candidates = result.entries.filter(
		(entry) => deletedBranchGarbageCollectionMetadataForWireAction(entry.action).isCandidate,
	);
	return renderDestructiveResultBlock(caps, {
		kind: gcResultKind(result),
		headline: gcHeadline(result, candidates.length),
		body: gcBody(result, candidates),
	});
}

async function loadAllSummaries(ctx: HandoffCliContext) {
	const summaries = await listHandoffSummaries(
		{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
		{ shouldIncludeDeleted: true },
	);
	if (summaries.type === "error") return failure(summaries.error.code, summaries.error.message);
	return { type: "resolved" as const, value: summaries.value };
}

async function executeAndFormat(
	ctx: HandoffCliContext,
	plan: DeletedBranchGarbageCollectionReport,
	options: { dryRun: boolean; cancelled: boolean },
): Promise<GcResult> {
	const result = await executeDeletedBranchGarbageCollection({ brmem: ctx.brmem }, plan);
	return toGcResult(result, options);
}

function toGcResult(
	report: DeletedBranchGarbageCollectionReport,
	options: { dryRun: boolean; cancelled: boolean },
): GcResult {
	return {
		entries: report.entries.map((entry) => ({
			...entry,
			action: deletedBranchGarbageCollectionMetadataForAction(entry.action).wireValue,
		})),
		wouldDeleteCount: report.counts.wouldDelete,
		deletedCount: report.counts.deleted,
		keptCount: report.counts.kept,
		errorCount: report.counts.error,
		dryRun: options.dryRun,
		cancelled: options.cancelled,
	};
}

function gcResultKind(result: GcResult): "success" | "failure" | "refusal" {
	if (result.cancelled) return "refusal";
	if (result.errorCount > 0) return "failure";
	return "success";
}

function gcHeadline(result: GcResult, candidateCount: number): string {
	if (result.cancelled) return "Cancelled handoff gc.";
	if (candidateCount === 0) return "No handoffs for deleted branches.";
	if (result.wouldDeleteCount > 0) return `Would delete ${result.wouldDeleteCount} handoff(s).`;
	if (result.errorCount > 0) return "Handoff gc completed with errors.";
	return `Deleted ${result.deletedCount} handoff(s).`;
}

function gcBody(result: GcResult, candidates: readonly GcResultEntry[]): string {
	const lines: string[] = [];
	if (result.cancelled) lines.push("No handoffs were deleted.");
	for (const entry of candidates) {
		const suffix = entry.message === null ? "" : `: ${entry.message}`;
		const actionLabel = deletedBranchGarbageCollectionMetadataForWireAction(entry.action).label;
		lines.push(`${actionLabel} ${entry.branchState} ${entry.branch} ${entry.slug}${suffix}`);
	}
	if (lines.length > 0) lines.push("");
	lines.push(summaryLine(result));
	return lines.join("\n");
}

function summaryLine(result: GcResult): string {
	return `Would delete ${result.wouldDeleteCount}; deleted ${result.deletedCount}; kept ${result.keptCount}; errors ${result.errorCount}`;
}

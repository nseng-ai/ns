import { failure, ok, requireInteractiveOrUsageError } from "@sdl/clinkr";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { listHandoffSummaries } from "../artifact-storage.ts";
import {
	executeDeletedBranchGarbageCollection,
	planDeletedBranchGarbageCollection,
	type DeletedBranchGarbageCollectionAction,
	type DeletedBranchGarbageCollectionReport,
} from "../gc-core.ts";
import { handoffSummarySchema } from "../inventory.ts";

const GC_ACTION_VALUE_BY_ACTION = {
	kept_active: "kept_active",
	would_delete: "would_delete",
	deleted: "deleted",
	error: "error",
} as const satisfies { readonly [K in DeletedBranchGarbageCollectionAction]: K };
export const gcActionSchema = z.enum([
	GC_ACTION_VALUE_BY_ACTION.kept_active,
	GC_ACTION_VALUE_BY_ACTION.would_delete,
	GC_ACTION_VALUE_BY_ACTION.deleted,
	GC_ACTION_VALUE_BY_ACTION.error,
]);
export type GcAction = DeletedBranchGarbageCollectionAction;

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
	would_delete_count: z.number().int(),
	deleted_count: z.number().int(),
	kept_count: z.number().int(),
	error_count: z.number().int(),
	dry_run: z.boolean(),
	cancelled: z.boolean(),
});

export type GcRequest = z.infer<typeof gcRequestSchema>;
export type GcResultEntry = z.infer<typeof gcResultEntrySchema>;
export type GcResult = z.infer<typeof gcResultSchema>;

export async function runGc(ctx: HandoffCliContext, request: GcRequest) {
	if (request.dryRun && request.force)
		return failure("conflicting_flags", "--dry-run and --force are mutually exclusive.");
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

	const gate = requireInteractiveOrUsageError(ctx.interaction, {
		message: "Deleting handoffs with gc requires --force when non-interactive.",
		missingFlag: "--force",
		howToSupply: "Pass --force (or -f) to delete without prompting, or run --dry-run first.",
	});
	if (gate) return gate;

	ctx.stderr(`${renderGc(preview)}\n`);
	const confirmed = await ctx.interaction.confirm({
		message: `Delete ${preview.would_delete_count} handoff(s)?`,
		defaultAnswer: "no",
	});
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

export function renderGc(result: GcResult): string {
	if (result.cancelled) return "Cancelled — no handoffs deleted.";
	const candidates = result.entries.filter(
		(entry) =>
			entry.action === "would_delete" || entry.action === "deleted" || entry.action === "error",
	);
	const lines: string[] = [];
	if (candidates.length === 0) {
		lines.push("No handoffs for deleted branches.");
		lines.push(summaryLine(result));
		return lines.join("\n");
	}
	if (result.would_delete_count > 0)
		lines.push(`Would delete ${result.would_delete_count} handoff(s) for deleted branches:`);
	else lines.push(`Deleted ${result.deleted_count} handoff(s) for deleted branches:`);
	for (const entry of candidates) {
		const suffix = entry.message === null ? "" : `: ${entry.message}`;
		lines.push(
			`  ${entry.action.replaceAll("_", " ")} ${entry.branch_state} ${entry.branch} ${entry.slug}${suffix}`,
		);
	}
	lines.push("");
	lines.push(summaryLine(result));
	return lines.join("\n");
}

async function loadAllSummaries(ctx: HandoffCliContext) {
	const summaries = await listHandoffSummaries(
		{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
		{ branch: undefined, shouldIncludeDeleted: true },
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
		entries: report.entries.map((entry) => ({ ...entry })),
		would_delete_count: report.counts.wouldDelete,
		deleted_count: report.counts.deleted,
		kept_count: report.counts.kept,
		error_count: report.counts.error,
		dry_run: options.dryRun,
		cancelled: options.cancelled,
	};
}

function summaryLine(result: GcResult): string {
	return `Would delete ${result.would_delete_count}; deleted ${result.deleted_count}; kept ${result.kept_count}; errors ${result.error_count}`;
}

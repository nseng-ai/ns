import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { deleteHandoffArtifact, listHandoffSummaries } from "../artifact-storage.ts";
import { handoffSummarySchema, type HandoffSummary } from "../inventory.ts";
import { confirmFromStdin } from "./shared.ts";

const gcActionSchema = z.enum(["kept_active", "would_delete", "deleted", "error"]);
export type GcAction = z.infer<typeof gcActionSchema>;

export const gcRequestSchema = z.object({
	dry_run: z.boolean().default(false).describe("Preview deletions without deleting."),
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
	if (request.dry_run && request.force) return failure("conflicting_flags", "--dry-run and --force are mutually exclusive.");
	const summaries = await loadAllSummaries(ctx);
	if (summaries.type !== "resolved") return summaries;
	const preview = previewResult(summaries.value, request.dry_run);
	if (request.dry_run || preview.would_delete_count === 0) return ok(preview);
	if (request.force) return ok(await deleteDeletedBranchHandoffs(ctx, summaries.value));

	ctx.stderr(`${renderGc(preview)}\n`);
	const confirmed = await confirmFromStdin({
		stdin: ctx.stdin,
		stderr: ctx.stderr,
		prompt: `Delete ${preview.would_delete_count} handoff(s)? [y/N]: `,
	});
	if (confirmed === "yes") return ok(await deleteDeletedBranchHandoffs(ctx, summaries.value));
	if (confirmed !== "no") return confirmed;
	return ok(resultFromEntries(preview.entries, { dryRun: false, cancelled: true }));
}

export function renderGc(result: GcResult): string {
	if (result.cancelled) return "Cancelled — no handoffs deleted.";
	const candidates = result.entries.filter((entry) => entry.action === "would_delete" || entry.action === "deleted" || entry.action === "error");
	const lines: string[] = [];
	if (candidates.length === 0) {
		lines.push("No handoffs for deleted branches.");
		lines.push(summaryLine(result));
		return lines.join("\n");
	}
	if (result.would_delete_count > 0) lines.push(`Would delete ${result.would_delete_count} handoff(s) for deleted branches:`);
	else lines.push(`Deleted ${result.deleted_count} handoff(s) for deleted branches:`);
	for (const entry of candidates) {
		const suffix = entry.message === null ? "" : `: ${entry.message}`;
		lines.push(`  ${entry.action.replaceAll("_", " ")} ${entry.branch_state} ${entry.branch} ${entry.slug}${suffix}`);
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

function previewResult(summaries: readonly HandoffSummary[], dryRun: boolean): GcResult {
	return resultFromEntries(
		summaries.map((summary) => entryFromSummary(summary, summary.branch_state === "deleted" ? "would_delete" : "kept_active")),
		{ dryRun, cancelled: false },
	);
}

async function deleteDeletedBranchHandoffs(ctx: HandoffCliContext, summaries: readonly HandoffSummary[]): Promise<GcResult> {
	const entries: GcResultEntry[] = [];
	for (const summary of summaries) {
		if (summary.branch_state === "active") {
			entries.push(entryFromSummary(summary, "kept_active"));
			continue;
		}
		const deleted = await deleteHandoffArtifact(
			{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
			{ branch: summary.branch, key: summary.key },
		);
		if (deleted.type === "error") {
			const message = deleted.error.code === "handoff_not_found"
				? `Handoff disappeared before deletion: ${deleted.error.message}`
				: deleted.error.message;
			entries.push(entryFromSummary(summary, "error", { message }));
			continue;
		}
		entries.push(entryFromSummary(summary, "deleted", { commit: deleted.value.commit }));
	}
	return resultFromEntries(entries, { dryRun: false, cancelled: false });
}

function entryFromSummary(summary: HandoffSummary, action: GcAction, options: { commit?: string | undefined; message?: string | undefined } = {}): GcResultEntry {
	return {
		...summary,
		action,
		commit: options.commit ?? null,
		message: options.message ?? null,
	};
}

function resultFromEntries(entries: readonly GcResultEntry[], options: { dryRun: boolean; cancelled: boolean }): GcResult {
	return {
		entries: [...entries],
		would_delete_count: entries.filter((entry) => entry.action === "would_delete").length,
		deleted_count: entries.filter((entry) => entry.action === "deleted").length,
		kept_count: entries.filter((entry) => entry.action === "kept_active").length,
		error_count: entries.filter((entry) => entry.action === "error").length,
		dry_run: options.dryRun,
		cancelled: options.cancelled,
	};
}

function summaryLine(result: GcResult): string {
	return `Would delete ${result.would_delete_count}; deleted ${result.deleted_count}; kept ${result.kept_count}; errors ${result.error_count}`;
}

import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { threadManifestItemSchema } from "./feedback-manifest-contracts.ts";
import type { PayloadReference } from "./payload-store.ts";
import { resolveFinalizeRunSessionInput } from "./session-inputs.ts";

const nullableStringSchema = z.string().nullable().default(null);
const payloadReferenceSchema = z.looseObject({ payload_path: nullableStringSchema });
const finalizationThreadManifestItemSchema = threadManifestItemSchema.extend({ item_pointer: nullableStringSchema });
const feedbackManifestSchema = z.looseObject({
	payload_reference: payloadReferenceSchema,
	pr_number: z.number().int(),
	review_threads: z.array(finalizationThreadManifestItemSchema).default([]),
});
const validationCommandSchema = z.looseObject({
	command: z.string(),
	status: z.string(),
	exit_code: z.number().int().nullable().default(null),
	summary: nullableStringSchema,
});
const skippedThreadSchema = z.looseObject({
	thread_id: z.string(),
	skip_reason: nullableStringSchema,
	summary: nullableStringSchema,
});
const threadSummarySchema = z.looseObject({
	resolved_thread_ids: z.array(z.string()).default([]),
	failed_thread_ids: z.array(z.string()).default([]),
	skipped_thread_ids: z.array(z.string()).default([]),
	skipped_threads: z.array(skippedThreadSchema).default([]),
});
const nonThreadOutcomeSchema = z.looseObject({
	source_kind: z.enum(["review", "discussion_comment"]),
	review_id: nullableStringSchema,
	discussion_comment_id: z.number().int().nullable().default(null),
	action: z.string(),
	result_comment_id: z.number().int().nullable().default(null),
	reaction_added: z.boolean().nullable().default(null),
	skip_reason: nullableStringSchema,
	summary: nullableStringSchema,
});
const checkpointSchema = z.looseObject({
	valid: z.boolean(),
	batch_complete: z.boolean(),
	batch_id: z.string(),
	pr_number: z.number().int().nullable().default(null),
	checkpoint_reference: z.unknown().nullable().default(null),
	commit_sha: nullableStringSchema,
	changed_files: z.array(z.string()).default([]),
	validation_commands: z.array(validationCommandSchema).default([]),
	thread_summary: threadSummarySchema.nullable().default(null),
	non_thread_outcomes: z.array(nonThreadOutcomeSchema).default([]),
});
const expectedBatchSchema = z.looseObject({ batch_id: z.string() });
const missingCheckpointSchema = z.looseObject({ batch_id: z.string() });
export const finalizeRunInputSchema = z.looseObject({
	feedback: feedbackManifestSchema,
	checkpoints: z.array(checkpointSchema).default([]),
	expected_batches: z.array(expectedBatchSchema).default([]),
	missing_checkpoints: z.array(missingCheckpointSchema).default([]),
});

type FinalizeRunInput = z.infer<typeof finalizeRunInputSchema>;
type Checkpoint = z.infer<typeof checkpointSchema>;
type MissingCheckpoint = z.infer<typeof missingCheckpointSchema>;
type ThreadManifestItem = z.infer<typeof finalizationThreadManifestItemSchema>;
type NonThreadOutcome = z.infer<typeof nonThreadOutcomeSchema>;

interface FinalizeRunError {
	code: string;
	message: string;
	batch_id: string | null;
	thread_id: string | null;
	review_id: string | null;
	discussion_comment_id: number | null;
}

interface SkippedItem {
	source_kind: "review_thread" | "review" | "discussion_comment";
	thread_id: string | null;
	review_id: string | null;
	discussion_comment_id: number | null;
	batch_id: string | null;
	skip_reason: string | null;
	summary: string | null;
}

interface FinalizeRunCounts {
	checkpoint_batches: number;
	complete_batches: number;
	incomplete_batches: number;
	unresolved_threads: number;
	unresolved_unskipped_threads: number;
	resolved_threads_from_checkpoints: number;
	failed_threads_from_checkpoints: number;
	skipped_threads: number;
	skipped_non_thread_items: number;
}

interface FinalizeRunThreadSummary {
	thread_id: string;
	path: string;
	line: number | null;
	start_line: number | null;
	is_outdated: boolean;
	is_resolved: boolean;
	comment_count: number;
	item_pointer: string | null;
}

interface FinalizeRunCheckpointSummary {
	batch_id: string;
	valid: boolean;
	batch_complete: boolean;
	commit_sha: string | null;
	changed_files: string[];
	checkpoint_reference: unknown;
	resolved_thread_ids: string[];
	failed_thread_ids: string[];
	skipped_thread_ids: string[];
	non_thread_outcomes: NonThreadOutcome[];
	failed_validation_commands: Array<z.infer<typeof validationCommandSchema>>;
}

interface FinalizeRunResolvedInputs {
	plan: PayloadReference;
	feedback: PayloadReference;
	checkpoints: Array<{ batch_id: string; reference: PayloadReference }>;
}

export interface FinalizeRunResult {
	valid: boolean;
	ready_to_stop: boolean;
	all_feedback_addressed: boolean;
	pr_number: number;
	payload_path: string | null;
	resolved_inputs?: FinalizeRunResolvedInputs | undefined;
	counts: FinalizeRunCounts;
	unresolved_threads: FinalizeRunThreadSummary[];
	unresolved_unskipped_threads: FinalizeRunThreadSummary[];
	skipped_items: SkippedItem[];
	checkpoint_summaries: FinalizeRunCheckpointSummary[];
	errors: FinalizeRunError[];
	warnings: string[];
}

const finalizeRunParseSchema = z.object({
	pr_number: z.number().int(),
	harness_session_id: z.string().optional(),
});

export const finalizeRunOperation = defineExecOperation({
	spec: {
		name: "finalize-run",
		description: "Summarize final pr-address unresolved, skipped, and checkpoint evidence.",
		schema: finalizeRunParseSchema,
		handler: runFinalizeRunOperation,
	},
});

async function runFinalizeRunOperation(ctx: PrAddressExecContext, request: z.output<typeof finalizeRunParseSchema>): Promise<ClinkrExit<unknown>> {
	if (request.pr_number <= 0) return failure("invalid_request", "--pr-number must be a positive integer.");
	const input = await resolveFinalizeRunSessionInput({ ctx, prNumber: request.pr_number, harnessSessionId: request.harness_session_id });
	if (input.type === "error") return failure(input.errorType, input.message);
	const parsed = finalizeRunInputSchema.safeParse(input.value.payload);
	if (!parsed.success) return failure("invalid_request", `Resolved finalization session inputs are invalid: ${z.prettifyError(parsed.error)}`);
	const result = { ...finalizeRun(parsed.data), resolved_inputs: input.value.resolvedInputs };
	if (result.valid && result.ready_to_stop) return ok(result);
	return negative("Final pr-address verification found unresolved, failed, or inconsistent evidence; do not treat the run as complete.", result);
}

export function finalizeRun(request: FinalizeRunInput): FinalizeRunResult {
	const errors: FinalizeRunError[] = [];
	const warnings: string[] = [];
	let invalidErrorCount = 0;
	if (request.checkpoints.length === 0) warnings.push("No batch checkpoint evidence supplied.");
	for (const missing of request.missing_checkpoints) errors.push(missingCheckpointError(missing));
	invalidErrorCount += validatePrNumbers(request, errors);
	invalidErrorCount += validateUniqueBatchIds(request, errors);
	const checkpointSummaries = checkpointSummariesForRequest(request.checkpoints);
	const skippedItems = skippedItemsForCheckpoints(request.checkpoints);
	const skippedThreadIds = new Set(skippedItems.flatMap((item) => (item.thread_id !== null ? [item.thread_id] : [])));
	const unresolvedThreads = request.feedback.review_threads.filter((thread) => !thread.is_resolved).map(threadSummary);
	const unresolvedById = new Map(unresolvedThreads.map((thread) => [String(thread.thread_id), thread]));
	const unresolvedUnskippedThreads = unresolvedThreads.filter((thread) => !skippedThreadIds.has(String(thread.thread_id)));
	const resolvedThreadIds = checkpointThreadIds(request.checkpoints, "resolved_thread_ids");
	const failedThreadIds = checkpointThreadIds(request.checkpoints, "failed_thread_ids");
	for (const threadId of [...resolvedThreadIds].filter((id) => unresolvedById.has(id)).sort()) {
		errors.push(errorItem({ code: "checkpointed_thread_still_unresolved", message: `Checkpoint evidence says thread ${threadId} was resolved, but fresh feedback still reports it unresolved.`, threadId }));
	}
	for (const checkpoint of request.checkpoints) errors.push(...checkpointErrors(checkpoint));
	const hasIncompleteCheckpoint = request.checkpoints.some((checkpoint) => !checkpoint.valid || !checkpoint.batch_complete) || request.missing_checkpoints.length > 0;
	const hasFailedThreads = failedThreadIds.size > 0;
	const hasFailedValidation = request.checkpoints.some((checkpoint) => checkpoint.validation_commands.some((command) => command.status === "failed"));
	const valid = invalidErrorCount === 0;
	const readyToStop =
		valid &&
		!hasIncompleteCheckpoint &&
		!hasFailedThreads &&
		!hasFailedValidation &&
		unresolvedUnskippedThreads.length === 0 &&
		!errors.some((error) => error.code === "checkpointed_thread_still_unresolved");
	const allFeedbackAddressed = readyToStop && skippedItems.length === 0 && unresolvedThreads.length === 0;
	return {
		valid,
		ready_to_stop: readyToStop,
		all_feedback_addressed: allFeedbackAddressed,
		pr_number: request.feedback.pr_number,
		payload_path: request.feedback.payload_reference.payload_path,
		counts: {
			checkpoint_batches: request.checkpoints.length,
			complete_batches: request.checkpoints.filter((checkpoint) => checkpoint.valid && checkpoint.batch_complete).length,
			incomplete_batches: request.checkpoints.filter((checkpoint) => !checkpoint.valid || !checkpoint.batch_complete).length + request.missing_checkpoints.length,
			unresolved_threads: unresolvedThreads.length,
			unresolved_unskipped_threads: unresolvedUnskippedThreads.length,
			resolved_threads_from_checkpoints: resolvedThreadIds.size,
			failed_threads_from_checkpoints: failedThreadIds.size,
			skipped_threads: skippedThreadIds.size,
			skipped_non_thread_items: skippedItems.filter((item) => item.source_kind !== "review_thread").length,
		},
		unresolved_threads: unresolvedThreads,
		unresolved_unskipped_threads: unresolvedUnskippedThreads,
		skipped_items: skippedItems,
		checkpoint_summaries: checkpointSummaries,
		errors,
		warnings,
	};
}

function validatePrNumbers(request: FinalizeRunInput, errors: FinalizeRunError[]): number {
	let invalidErrorCount = 0;
	for (const checkpoint of request.checkpoints) {
		if (checkpoint.pr_number === null || checkpoint.pr_number === request.feedback.pr_number) continue;
		invalidErrorCount += 1;
		errors.push(errorItem({ code: "pr_number_mismatch", message: `Checkpoint batch ${checkpoint.batch_id} is for PR ${checkpoint.pr_number}, but final feedback is for PR ${request.feedback.pr_number}.`, batchId: checkpoint.batch_id }));
	}
	return invalidErrorCount;
}

function validateUniqueBatchIds(request: FinalizeRunInput, errors: FinalizeRunError[]): number {
	const counts = new Map<string, number>();
	for (const checkpoint of request.checkpoints) counts.set(checkpoint.batch_id, (counts.get(checkpoint.batch_id) ?? 0) + 1);
	const duplicateBatchIds = [...counts.entries()].filter(([, count]) => count > 1).map(([batchId]) => batchId).sort();
	for (const batchId of duplicateBatchIds) errors.push(errorItem({ code: "duplicate_checkpoint_batch", message: `Duplicate checkpoint evidence supplied for batch_id '${batchId}'.`, batchId }));
	return duplicateBatchIds.length;
}

function checkpointSummariesForRequest(checkpoints: readonly Checkpoint[]): FinalizeRunCheckpointSummary[] {
	return checkpoints.map((checkpoint) => {
		const threadSummaryValue = checkpoint.thread_summary;
		return {
			batch_id: checkpoint.batch_id,
			valid: checkpoint.valid,
			batch_complete: checkpoint.batch_complete,
			commit_sha: checkpoint.commit_sha,
			changed_files: [...checkpoint.changed_files],
			checkpoint_reference: checkpoint.checkpoint_reference,
			resolved_thread_ids: threadSummaryValue?.resolved_thread_ids ?? [],
			failed_thread_ids: threadSummaryValue?.failed_thread_ids ?? [],
			skipped_thread_ids: threadSummaryValue?.skipped_thread_ids ?? [],
			non_thread_outcomes: checkpoint.non_thread_outcomes,
			failed_validation_commands: checkpoint.validation_commands.filter((command) => command.status === "failed"),
		};
	});
}

function skippedItemsForCheckpoints(checkpoints: readonly Checkpoint[]): SkippedItem[] {
	const skippedItems: SkippedItem[] = [];
	for (const checkpoint of checkpoints) {
		skippedItems.push(...skippedThreadItems(checkpoint));
		skippedItems.push(...skippedNonThreadItems(checkpoint));
	}
	return skippedItems;
}

function skippedThreadItems(checkpoint: Checkpoint): SkippedItem[] {
	if (checkpoint.thread_summary === null) return [];
	const items: SkippedItem[] = [];
	const detailedThreadIds = new Set<string>();
	for (const skippedThread of checkpoint.thread_summary.skipped_threads) {
		detailedThreadIds.add(skippedThread.thread_id);
		items.push({ source_kind: "review_thread", thread_id: skippedThread.thread_id, review_id: null, discussion_comment_id: null, batch_id: checkpoint.batch_id, skip_reason: skippedThread.skip_reason, summary: skippedThread.summary });
	}
	for (const threadId of checkpoint.thread_summary.skipped_thread_ids) {
		if (detailedThreadIds.has(threadId)) continue;
		items.push({ source_kind: "review_thread", thread_id: threadId, review_id: null, discussion_comment_id: null, batch_id: checkpoint.batch_id, skip_reason: null, summary: null });
	}
	return items;
}

function skippedNonThreadItems(checkpoint: Checkpoint): SkippedItem[] {
	const items: SkippedItem[] = [];
	for (const outcome of checkpoint.non_thread_outcomes) {
		if (outcome.action !== "skipped") continue;
		items.push({ source_kind: outcome.source_kind, thread_id: null, review_id: outcome.review_id, discussion_comment_id: outcome.discussion_comment_id, batch_id: checkpoint.batch_id, skip_reason: outcome.skip_reason, summary: outcome.summary });
	}
	return items;
}

function checkpointThreadIds(checkpoints: readonly Checkpoint[], fieldName: "resolved_thread_ids" | "failed_thread_ids"): Set<string> {
	const threadIds = new Set<string>();
	for (const checkpoint of checkpoints) {
		if (checkpoint.thread_summary === null) continue;
		for (const threadId of checkpoint.thread_summary[fieldName]) threadIds.add(threadId);
	}
	return threadIds;
}

function checkpointErrors(checkpoint: Checkpoint): FinalizeRunError[] {
	const errors: FinalizeRunError[] = [];
	if (!checkpoint.valid) errors.push(errorItem({ code: "invalid_checkpoint_evidence", message: `Checkpoint batch ${checkpoint.batch_id} is invalid.`, batchId: checkpoint.batch_id }));
	else if (!checkpoint.batch_complete) errors.push(errorItem({ code: "incomplete_checkpoint_evidence", message: `Checkpoint batch ${checkpoint.batch_id} is incomplete or failed.`, batchId: checkpoint.batch_id }));
	if (checkpoint.thread_summary !== null) {
		for (const threadId of checkpoint.thread_summary.failed_thread_ids) errors.push(errorItem({ code: "checkpoint_failed_thread", message: `Checkpoint batch ${checkpoint.batch_id} reports failed thread resolution for ${threadId}.`, batchId: checkpoint.batch_id, threadId }));
	}
	for (const command of checkpoint.validation_commands) {
		if (command.status !== "failed") continue;
		errors.push(errorItem({ code: "failed_validation_command", message: `Checkpoint batch ${checkpoint.batch_id} reports failed validation command: ${command.command}`, batchId: checkpoint.batch_id }));
	}
	return errors;
}

function missingCheckpointError(missing: MissingCheckpoint): FinalizeRunError {
	return errorItem({
		code: "missing_checkpoint_evidence",
		message: `Missing checkpoint evidence for planned batch ${missing.batch_id}.`,
		batchId: missing.batch_id,
	});
}

function threadSummary(thread: ThreadManifestItem): FinalizeRunThreadSummary {
	return {
		thread_id: thread.thread_id,
		path: thread.path,
		line: thread.line,
		start_line: thread.start_line,
		is_outdated: thread.is_outdated,
		is_resolved: thread.is_resolved,
		comment_count: thread.comment_count,
		item_pointer: thread.item_pointer,
	};
}

function errorItem(options: { code: string; message: string; batchId?: string | null | undefined; threadId?: string | null | undefined; reviewId?: string | null | undefined; discussionCommentId?: number | null | undefined }): FinalizeRunError {
	return {
		code: options.code,
		message: options.message,
		batch_id: options.batchId ?? null,
		thread_id: options.threadId ?? null,
		review_id: options.reviewId ?? null,
		discussion_comment_id: options.discussionCommentId ?? null,
	};
}


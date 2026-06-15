import { z } from "zod";

import {
	nullableBooleanSchema,
	nullableIntSchema,
	nullableStringSchema,
	payloadReferenceSchema,
	resolutionProvenanceInputSchema,
	resolutionReplyModeSchema,
} from "./shared.ts";

// --- build-resolve-thread-batch-payload ----------------------------------------------

export const buildResolveThreadBatchPayloadRequestSchema = z.object({
	pr_number: z.int(),
	batch_id: z.string(),
	commit_sha: nullableStringSchema.optional(),
	continue_on_error: z.boolean().optional(),
	decisions_file: z.string(),
	harness_session_id: nullableStringSchema.optional(),
});

const buildResolveThreadBatchPayloadErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	batch_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
});

const ignoredNonThreadItemSchema = z.object({
	source_kind: z.string(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	summary: z.string(),
});

const skippedResolveThreadItemSchema = z.object({
	thread_id: z.string(),
	skip_reason: z.string(),
	summary: z.string(),
});

const resolveThreadBatchPayloadItemSchema = z.object({
	thread_id: z.string(),
	mode: resolutionReplyModeSchema,
	message: nullableStringSchema.optional(),
	commit_sha: nullableStringSchema.optional(),
	provenance: resolutionProvenanceInputSchema.nullable().optional(),
});

export const resolveThreadBatchPayloadSchema = z.object({
	commit_sha: nullableStringSchema.optional(),
	continue_on_error: z.boolean().optional(),
	items: z.array(resolveThreadBatchPayloadItemSchema),
});

export const buildResolveThreadBatchPayloadResultSchema = z.object({
	valid: z.boolean(),
	payload_ready: z.boolean(),
	batch_id: z.string(),
	commit_sha: nullableStringSchema.optional(),
	continue_on_error: z.boolean().optional(),
	review_thread_count: z.int(),
	resolved_thread_count: z.int(),
	skipped_thread_count: z.int(),
	ignored_non_thread_items: z.array(ignoredNonThreadItemSchema).optional(),
	skipped_items: z.array(skippedResolveThreadItemSchema).optional(),
	payload: resolveThreadBatchPayloadSchema.nullable().optional(),
	errors: z.array(buildResolveThreadBatchPayloadErrorSchema).optional(),
	warnings: z.array(z.string()).optional(),
	resolved_inputs: z.object({ plan: payloadReferenceSchema }).optional(),
	build_reference: payloadReferenceSchema.nullable().optional(),
});

// --- record-batch-checkpoint ------------------------------------------------------

const batchValidationCommandEvidenceSchema = z.object({
	command: z.string(),
	status: z.enum(["passed", "failed", "skipped"]),
	exit_code: nullableIntSchema.optional(),
	summary: nullableStringSchema.optional(),
});

const batchNonThreadOutcomeSummarySchema = z.object({
	source_kind: z.enum(["review", "discussion_comment"]),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	action: z.enum(["replied", "skipped", "no_reply_needed"]),
	result_comment_id: nullableIntSchema.optional(),
	reaction_added: nullableBooleanSchema.optional(),
	skip_reason: nullableStringSchema.optional(),
	summary: nullableStringSchema.optional(),
});

const batchCheckpointErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	batch_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
});

const batchCheckpointPlanItemSchema = z.object({
	source_kind: z.string(),
	summary: z.string(),
	action_summary: z.string(),
	review_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	covered_comment_ids: z.array(z.int()).optional(),
	needs_reply: nullableBooleanSchema.optional(),
	pre_existing: z.boolean().optional(),
	author: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
});

const batchSkippedThreadSummarySchema = z.object({
	thread_id: z.string(),
	skip_reason: nullableStringSchema.optional(),
	summary: nullableStringSchema.optional(),
});

const batchThreadCheckpointSummarySchema = z.object({
	review_thread_count: z.int(),
	payload_ready: nullableBooleanSchema.optional(),
	resolved_thread_ids: z.array(z.string()).optional(),
	failed_thread_ids: z.array(z.string()).optional(),
	skipped_thread_ids: z.array(z.string()).optional(),
	skipped_threads: z.array(batchSkippedThreadSummarySchema).optional(),
	ignored_non_thread_count: z.int().optional(),
	all_succeeded: nullableBooleanSchema.optional(),
});

export const recordBatchCheckpointResultSchema = z.object({
	valid: z.boolean(),
	batch_complete: z.boolean(),
	batch_id: z.string(),
	complexity: nullableStringSchema.optional(),
	approval_required: nullableBooleanSchema.optional(),
	pr_number: nullableIntSchema.optional(),
	payload_path: nullableStringSchema.optional(),
	checkpoint_reference: payloadReferenceSchema.nullable().optional(),
	commit_sha: nullableStringSchema.optional(),
	changed_files: z.array(z.string()).optional(),
	validation_commands: z.array(batchValidationCommandEvidenceSchema).optional(),
	selected_items: z.array(batchCheckpointPlanItemSchema).optional(),
	thread_summary: batchThreadCheckpointSummarySchema.nullable().optional(),
	non_thread_outcomes: z.array(batchNonThreadOutcomeSummarySchema).optional(),
	errors: z.array(batchCheckpointErrorSchema).optional(),
	warnings: z.array(z.string()).optional(),
});

// --- finalize-run -----------------------------------------------------------------

const finalizeRunThreadSummarySchema = z.object({
	thread_id: z.string(),
	path: z.string(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: z.boolean(),
	is_resolved: z.boolean(),
	comment_count: z.int(),
	item_pointer: nullableStringSchema.optional(),
});

const finalizeRunSkippedItemSchema = z.object({
	source_kind: z.enum(["review_thread", "review", "discussion_comment"]),
	thread_id: nullableStringSchema.optional(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	batch_id: nullableStringSchema.optional(),
	skip_reason: nullableStringSchema.optional(),
	summary: nullableStringSchema.optional(),
});

const finalizeRunCheckpointSummarySchema = z.object({
	batch_id: z.string(),
	valid: z.boolean(),
	batch_complete: z.boolean(),
	commit_sha: nullableStringSchema.optional(),
	changed_files: z.array(z.string()).optional(),
	checkpoint_reference: payloadReferenceSchema.nullable().optional(),
	resolved_thread_ids: z.array(z.string()).optional(),
	failed_thread_ids: z.array(z.string()).optional(),
	skipped_thread_ids: z.array(z.string()).optional(),
	non_thread_outcomes: z.array(batchNonThreadOutcomeSummarySchema).optional(),
	failed_validation_commands: z.array(batchValidationCommandEvidenceSchema).optional(),
});

const finalizeRunCountsSchema = z.object({
	checkpoint_batches: z.int(),
	complete_batches: z.int(),
	incomplete_batches: z.int(),
	unresolved_threads: z.int(),
	unresolved_unskipped_threads: z.int(),
	resolved_threads_from_checkpoints: z.int(),
	failed_threads_from_checkpoints: z.int(),
	skipped_threads: z.int(),
	skipped_non_thread_items: z.int(),
});

const finalizeRunErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	batch_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
});

export const finalizeRunResultSchema = z.object({
	valid: z.boolean(),
	ready_to_stop: z.boolean(),
	all_feedback_addressed: z.boolean(),
	pr_number: z.int(),
	payload_path: nullableStringSchema.optional(),
	counts: finalizeRunCountsSchema,
	unresolved_threads: z.array(finalizeRunThreadSummarySchema).optional(),
	unresolved_unskipped_threads: z.array(finalizeRunThreadSummarySchema).optional(),
	skipped_items: z.array(finalizeRunSkippedItemSchema).optional(),
	checkpoint_summaries: z.array(finalizeRunCheckpointSummarySchema).optional(),
	errors: z.array(finalizeRunErrorSchema).optional(),
	warnings: z.array(z.string()).optional(),
});

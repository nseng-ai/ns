import { z } from "zod";

import { prDiscussionCommentSchema, prReviewCommentSchema, reactionSchema } from "../core/operation-schemas/github-mirrors.ts";
import {
	nullableBooleanSchema,
	nullableStringSchema,
	payloadReferenceSchema,
	resolutionProvenanceSchema,
	resolutionReplyModeSchema,
	stdoutModeRequestSchema,
} from "./shared.ts";

// --- mutation operations --------------------------------------------------------

export const replyToDiscussionRequestSchema = stdoutModeRequestSchema.extend({
	pr_number: z.int(),
	comment_id: z.int(),
	comment_author: z.string(),
	original_body: z.string(),
	response: z.string(),
	harness_session_id: nullableStringSchema.optional(),
});

export const replyToDiscussionResultSchema = z.object({
	body: z.string(),
	comment: prDiscussionCommentSchema,
	reaction_added: z.boolean(),
	reaction: reactionSchema.nullable().optional(),
	warning: nullableStringSchema.optional(),
});

export const replyToReviewRequestSchema = stdoutModeRequestSchema.extend({
	pr_number: z.int(),
	review_author: z.string(),
	summary_markdown: z.string(),
	harness_session_id: nullableStringSchema.optional(),
});

export const replyToReviewResultSchema = z.object({
	body: z.string(),
	comment: prDiscussionCommentSchema,
});

export const resolveThreadWithReplyRequestSchema = stdoutModeRequestSchema.extend({
	thread_id: z.string(),
	mode: resolutionReplyModeSchema,
	message: nullableStringSchema,
	commit_sha: nullableStringSchema,
	provenance_json: nullableStringSchema.optional(),
	harness_session_id: nullableStringSchema.optional(),
});

export const resolveThreadWithReplyResultSchema = z.object({
	thread_id: z.string(),
	body: z.string(),
	comment: prReviewCommentSchema,
	is_resolved: z.boolean(),
	provenance: resolutionProvenanceSchema.nullable().optional(),
});

export const resolveThreadBatchRequestSchema = stdoutModeRequestSchema.extend({
	from_build: z.string(),
});

const resolveThreadBatchItemResultSchema = z.object({
	index: z.int(),
	thread_id: z.string(),
	mode: resolutionReplyModeSchema,
	status: z.enum(["resolved", "failed", "skipped"]),
	body: nullableStringSchema.optional(),
	comment: prReviewCommentSchema.nullable().optional(),
	is_resolved: nullableBooleanSchema.optional(),
	error_type: nullableStringSchema.optional(),
	error_message: nullableStringSchema.optional(),
	provenance: resolutionProvenanceSchema.nullable().optional(),
});

export const resolveThreadBatchResultSchema = z.object({
	total: z.int(),
	resolved: z.int(),
	failed: z.int(),
	skipped: z.int(),
	all_succeeded: z.boolean(),
	results: z.array(resolveThreadBatchItemResultSchema),
	resolved_inputs: z.object({ build: payloadReferenceSchema }),
	resolution_reference: payloadReferenceSchema,
});

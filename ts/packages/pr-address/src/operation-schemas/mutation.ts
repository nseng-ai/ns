import { z } from "zod";

import { prDiscussionCommentSchema, prReviewCommentSchema, reactionSchema } from "./github-mirrors.ts";
import {
	nullableBooleanSchema,
	nullableStringSchema,
	resolutionProvenanceSchema,
	resolutionReplyModeSchema,
} from "./shared.ts";

// --- mutation operations --------------------------------------------------------

export const replyToDiscussionRequestSchema = z.object({
	pr_number: z.int(),
	comment_id: z.int(),
	comment_author: z.string(),
	original_body: z.string(),
	response: z.string(),
});

export const replyToDiscussionResultSchema = z.object({
	body: z.string(),
	comment: prDiscussionCommentSchema,
	reaction_added: z.boolean(),
	reaction: reactionSchema.nullable().optional(),
	warning: nullableStringSchema.optional(),
});

export const replyToReviewRequestSchema = z.object({
	pr_number: z.int(),
	review_author: z.string(),
	summary_markdown: z.string(),
});

export const replyToReviewResultSchema = z.object({
	body: z.string(),
	comment: prDiscussionCommentSchema,
});

export const resolveThreadWithReplyRequestSchema = z.object({
	thread_id: z.string(),
	mode: resolutionReplyModeSchema,
	message: nullableStringSchema,
	commit_sha: nullableStringSchema,
	provenance_json: nullableStringSchema.optional(),
});

export const resolveThreadWithReplyResultSchema = z.object({
	thread_id: z.string(),
	body: z.string(),
	comment: prReviewCommentSchema,
	is_resolved: z.boolean(),
	provenance: resolutionProvenanceSchema.nullable().optional(),
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

export const resolveThreadBatchRequestSchema = z.object({
	from_build: z.int().optional(),
	from_build_reference: nullableStringSchema.optional(),
	harness_session_id: nullableStringSchema.optional(),
});

export const resolveThreadBatchResultSchema = z.object({
	total: z.int(),
	resolved: z.int(),
	failed: z.int(),
	skipped: z.int(),
	all_succeeded: z.boolean(),
	results: z.array(resolveThreadBatchItemResultSchema),
	resolved_inputs: z.object({ resolve_build: z.unknown() }).optional(),
	resolution_reference: z.unknown().nullable().optional(),
});

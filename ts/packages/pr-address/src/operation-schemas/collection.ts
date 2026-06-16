import { z } from "zod";

import {
	getFeedbackInlineResultSchema,
	getFeedbackPayloadManifestSchema,
	prepareRunInlineResultSchema,
	prepareRunPayloadManifestSchema,
} from "./manifest-mirrors.ts";
import {
	detailKindSchema,
	nullableIntSchema,
	nullableStringSchema,
	payloadReferenceSchema,
	prStateSchema,
	stdoutModeRequestSchema,
} from "./shared.ts";

// --- map-branch-prs ---------------------------------------------------------------
// TypeScript-owned operation: the schema document and fixture are captured from
// `--json-schema` output.

export const mapBranchPrsRequestSchema = stdoutModeRequestSchema.extend({
	branches_json: z.string().optional(),
	harness_session_id: nullableStringSchema.optional(),
});

const mapBranchPrsEntrySchema = z.object({
	branch: z.string(),
	pr_number: z.int(),
	title: z.string(),
	url: z.string(),
	head_ref_name: z.string(),
	base_ref_name: z.string(),
});

export const mapBranchPrsSummarySchema = z.object({
	requested: z.int(),
	matched: z.int(),
	missing: z.int(),
	ambiguous: z.int(),
});

const ambiguousBranchPrsEntrySchema = z.object({
	branch: z.string(),
	candidates: z.array(mapBranchPrsEntrySchema),
});

export const mapBranchPrsResultSchema = z.object({
	branch_prs: z.array(mapBranchPrsEntrySchema),
	missing_branches: z.array(z.string()),
	ambiguous_branches: z.array(ambiguousBranchPrsEntrySchema),
	summary: mapBranchPrsSummarySchema,
});

// --- read-only collection operations -------------------------------------------

export const getFeedbackRequestSchema = stdoutModeRequestSchema.extend({
	pr_number: z.int(),
	include_resolved: z.boolean().optional(),
	include_empty_reviews: z.boolean().optional(),
	payload_mode: z.enum(["inline", "payload"]).optional(),
	harness_session_id: nullableStringSchema.optional(),
});

export const getFeedbackResultSchema = z.union([getFeedbackInlineResultSchema, getFeedbackPayloadManifestSchema]);

export const prepareRunRequestSchema = stdoutModeRequestSchema.extend({
	include_all_threads: z.boolean().optional(),
	include_empty_reviews: z.boolean().optional(),
	payload_mode: z.enum(["inline", "payload"]).optional(),
	harness_session_id: nullableStringSchema.optional(),
});

export const prepareRunResultSchema = z.union([prepareRunInlineResultSchema, prepareRunPayloadManifestSchema]);

// --- summarize-feedback ----------------------------------------------------------

export const summarizeFeedbackRequestSchema = stdoutModeRequestSchema.extend({
	pr_number: z.int(),
	include_resolved: z.boolean().optional(),
	include_empty_reviews: z.boolean().optional(),
	body_chars: z.int().optional(),
	harness_session_id: nullableStringSchema.optional(),
});

const compactPullRequestSummarySchema = z.object({
	number: z.int(),
	title: z.string(),
	url: z.string(),
	head_ref_name: z.string(),
	base_ref_name: z.string(),
	state: prStateSchema,
});

const feedbackSummaryCountsSchema = z.object({
	reviews: z.int(),
	review_threads: z.int(),
	unresolved_review_threads: z.int(),
	resolved_review_threads: z.int(),
	discussion_comments: z.int(),
});

const compactReviewSummarySchema = z.object({
	id: z.string(),
	author: z.string(),
	state: z.string(),
	submitted_at: z.string(),
	body_first_line_excerpt: nullableStringSchema,
	body_excerpt: z.string(),
});

const compactThreadCommentSummarySchema = z.object({
	id: z.int(),
	author: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	created_at: z.string(),
	body_first_line_excerpt: nullableStringSchema,
	body_excerpt: z.string(),
});

const compactThreadSummarySchema = z.object({
	thread_id: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	is_outdated: z.boolean(),
	is_resolved: z.boolean(),
	comment_count: z.int(),
	first_comment: compactThreadCommentSummarySchema.nullable(),
});

const compactDiscussionCommentSummarySchema = z.object({
	comment_id: z.int(),
	author: z.string(),
	url: z.string(),
	source_kind: z.enum(["automation_like", "human_like"]),
	source_evidence: z.array(z.string()),
	body_first_line_excerpt: nullableStringSchema,
	body_excerpt: z.string(),
});

export const summarizeFeedbackResultSchema = z.object({
	found: z.boolean(),
	pr_number: z.int(),
	pr: compactPullRequestSummarySchema.nullable().optional(),
	counts: feedbackSummaryCountsSchema.nullable().optional(),
	reviews: z.array(compactReviewSummarySchema).optional(),
	review_threads: z.array(compactThreadSummarySchema).optional(),
	discussion_comments: z.array(compactDiscussionCommentSummarySchema).optional(),
	error: nullableStringSchema.optional(),
	returncode: nullableIntSchema.optional(),
});

// --- read-feedback-detail ----------------------------------------------------------

export const readFeedbackDetailRequestSchema = stdoutModeRequestSchema.extend({
	payload_path: nullableStringSchema.optional(),
	pr_number: nullableIntSchema.optional(),
	json_pointer: z.string(),
	harness_session_id: nullableStringSchema.optional(),
});

export const readFeedbackDetailResultSchema = z.object({
	payload_path: z.string(),
	json_pointer: z.string(),
	detail_kind: detailKindSchema,
	value: z.unknown(),
	resolved_inputs: z.object({ feedback: payloadReferenceSchema }).optional(),
});

export const readFeedbackDetailsRequestSchema = stdoutModeRequestSchema.extend({
	selection_json: nullableStringSchema.optional(),
	pr_number: nullableIntSchema.optional(),
	harness_session_id: nullableStringSchema.optional(),
});

const selectedFeedbackDetailSummarySchema = z.object({
	json_pointer: z.string(),
	detail_kind: detailKindSchema,
	artifact_json_pointer: z.string(),
	value_kind: z.enum(["string", "object"]),
	value_chars: nullableIntSchema.optional(),
	body_chars: nullableIntSchema.optional(),
	object_keys: z.array(z.string()).nullable().optional(),
});

const selectedFeedbackDetailCountsSchema = z.object({
	requested: z.int(),
	selected: z.int(),
	body_values: z.int(),
	item_values: z.int(),
});

export const readFeedbackDetailsResultSchema = z.object({
	payload_path: z.string(),
	selected_payload_reference: payloadReferenceSchema,
	details: z.array(selectedFeedbackDetailSummarySchema),
	counts: selectedFeedbackDetailCountsSchema,
	resolved_inputs: z.object({ feedback: payloadReferenceSchema }).optional(),
});

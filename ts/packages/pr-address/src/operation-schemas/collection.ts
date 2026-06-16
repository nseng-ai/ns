import { z } from "zod";

import {
	getFeedbackInlineResultSchema,
	getFeedbackPayloadManifestSchema,
	prepareRunInlineResultSchema,
	prepareRunPayloadManifestSchema,
} from "../core/operation-schemas/manifest-mirrors.ts";
import {
	detailKindSchema,
	nullableIntSchema,
	nullableStringSchema,
	payloadReferenceSchema,
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

export const downloadFeedbackRequestSchema = z.object({
	pr_number: z.int().optional(),
	include_resolved: z.boolean().optional(),
	include_automation: z.boolean().optional(),
	include_empty_reviews: z.boolean().optional(),
	harness_session_id: nullableStringSchema.optional(),
});

const downloadFeedbackTargetSchema = z.object({
	kind: z.literal("github_pr"),
	pr_number: nullableIntSchema,
	branch: nullableStringSchema,
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
});

const downloadFeedbackCountsSchema = z.object({
	included_review_threads: z.int(),
	included_reviews: z.int(),
	included_discussion_comments: z.int(),
	excluded_resolved_threads: z.int(),
	excluded_empty_reviews: z.int(),
	excluded_automation_comments: z.int(),
});

export const downloadFeedbackResultSchema = z.object({
	found: z.boolean(),
	target: downloadFeedbackTargetSchema,
	counts: downloadFeedbackCountsSchema,
	markdown: z.string(),
});

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

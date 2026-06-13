import { z } from "zod";

import { prDiscussionCommentSchema, prReviewSchema, prReviewThreadSchema, restructuredFileSchema } from "./github-mirrors.ts";
import {
	nullableBooleanSchema,
	nullableIntSchema,
	nullableStringSchema,
	payloadReferenceSchema,
	prReviewStateSchema,
	prStateSchema,
} from "./shared.ts";

// --- feedback payload manifest contracts -------------------------------------

const feedbackDomainLocatorSchema = z.object({
	kind: z.enum(["review", "review_thread_comment", "discussion_comment"]),
	review_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	comment_id: nullableIntSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	comment_index: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_resolved: nullableBooleanSchema.optional(),
	is_outdated: nullableBooleanSchema.optional(),
	author: nullableStringSchema.optional(),
});

// Full body locator with domain metadata and char count; distinct from the 2-field
// classificationLocatorSchema used in classification.ts.
export const manifestBodyLocatorSchema = z.object({
	body_chars: z.int(),
	json_pointer: z.string(),
	item_pointer: nullableStringSchema.optional(),
	domain: feedbackDomainLocatorSchema,
});

export const feedbackCountsSchema = z.object({
	reviews: z.int(),
	review_threads: z.int(),
	unresolved_review_threads: z.int(),
	resolved_review_threads: z.int(),
	thread_comments: z.int(),
	discussion_comments: z.int(),
});

const reviewManifestItemSchema = z.object({
	id: z.string(),
	author: z.string(),
	state: prReviewStateSchema,
	submitted_at: z.string(),
	body_locator: manifestBodyLocatorSchema,
});

const threadCommentManifestItemSchema = z.object({
	id: z.int(),
	author: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	created_at: z.string(),
	body_locator: manifestBodyLocatorSchema,
});

const threadManifestItemSchema = z.object({
	thread_id: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comment_count: z.int(),
	item_pointer: z.string(),
	comments: z.array(threadCommentManifestItemSchema),
});

const discussionCommentManifestItemSchema = z.object({
	comment_id: z.int(),
	author: z.string(),
	url: z.string(),
	body_locator: manifestBodyLocatorSchema,
});

export const getFeedbackPayloadManifestSchema = z.object({
	payload_mode: z.literal("payload").optional(),
	payload_reference: payloadReferenceSchema,
	pr_number: z.int(),
	counts: feedbackCountsSchema,
	reviews: z.array(reviewManifestItemSchema),
	review_threads: z.array(threadManifestItemSchema),
	discussion_comments: z.array(discussionCommentManifestItemSchema),
});

export const getFeedbackInlineResultSchema = z.object({
	payload_mode: z.literal("inline").optional(),
	pr_number: z.int(),
	reviews: z.array(prReviewSchema),
	review_threads: z.array(prReviewThreadSchema),
	discussion_comments: z.array(prDiscussionCommentSchema),
});

export const prepareRunPayloadManifestSchema = z.object({
	payload_mode: z.literal("payload").optional(),
	payload_reference: payloadReferenceSchema,
	found: z.boolean(),
	current_branch: nullableStringSchema.optional(),
	number: nullableIntSchema.optional(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	head_ref_name: nullableStringSchema.optional(),
	base_ref_name: nullableStringSchema.optional(),
	state: prStateSchema.nullable().optional(),
	counts: feedbackCountsSchema.nullable().optional(),
	reviews: z.array(reviewManifestItemSchema).optional(),
	review_threads: z.array(threadManifestItemSchema).optional(),
	discussion_comments: z.array(discussionCommentManifestItemSchema).optional(),
	reopened_thread_ids: z.array(z.string()).optional(),
	restructured_files: z.array(restructuredFileSchema).optional(),
	warnings: z.array(z.string()).optional(),
	error: nullableStringSchema.optional(),
	returncode: nullableIntSchema.optional(),
});

export const prepareRunInlineResultSchema = z.object({
	payload_mode: z.literal("inline").optional(),
	found: z.boolean(),
	current_branch: nullableStringSchema.optional(),
	number: nullableIntSchema.optional(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	head_ref_name: nullableStringSchema.optional(),
	base_ref_name: nullableStringSchema.optional(),
	state: prStateSchema.nullable().optional(),
	reviews: z.array(prReviewSchema).optional(),
	review_threads: z.array(prReviewThreadSchema).optional(),
	discussion_comments: z.array(prDiscussionCommentSchema).optional(),
	reopened_thread_ids: z.array(z.string()).optional(),
	restructured_files: z.array(restructuredFileSchema).optional(),
	warnings: z.array(z.string()).optional(),
	error: nullableStringSchema.optional(),
	returncode: nullableIntSchema.optional(),
});

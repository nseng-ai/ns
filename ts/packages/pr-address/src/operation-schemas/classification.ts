import { z } from "zod";

import {
	actionComplexityDocSchema,
	informationalReasonDocSchema,
	manifestKindSchema,
	nullableIntSchema,
	nullableStringSchema,
	validationErrorCodeSchema,
	validationItemKindSchema,
} from "./shared.ts";

// --- classification validation / template contracts -----------------------------------

export const feedbackClassificationValidationErrorSchema = z.object({
	code: validationErrorCodeSchema,
	message: z.string(),
	kind: validationItemKindSchema,
	identifier: z.union([z.string(), z.int()]).nullable().optional(),
	path: nullableStringSchema.optional(),
});

const classificationBodyLocatorRefSchema = z.object({
	json_pointer: z.string(),
	item_pointer: nullableStringSchema.optional(),
});

const classificationTemplateReviewItemSchema = z.object({
	review_id: z.string(),
	disposition: z.string().optional(),
	body_locator: classificationBodyLocatorRefSchema,
	summary: z.string().optional(),
	action_summary: nullableStringSchema.optional(),
	complexity: actionComplexityDocSchema.nullable().optional(),
	pre_existing: z.boolean().optional(),
	informational_reason: informationalReasonDocSchema.nullable().optional(),
});

const classificationTemplateThreadCommentRefSchema = z.object({
	comment_id: z.int(),
	body_locator: classificationBodyLocatorRefSchema,
});

const classificationTemplateThreadItemSchema = z.object({
	thread_id: z.string(),
	disposition: z.string().optional(),
	thread_item_pointer: z.string(),
	covered_comments: z.array(classificationTemplateThreadCommentRefSchema),
	summary: z.string().optional(),
	action_summary: nullableStringSchema.optional(),
	complexity: actionComplexityDocSchema.nullable().optional(),
	pre_existing: z.boolean().optional(),
	informational_reason: informationalReasonDocSchema.nullable().optional(),
});

const classificationTemplateDiscussionCommentItemSchema = z.object({
	comment_id: z.int(),
	disposition: z.string().optional(),
	body_locator: classificationBodyLocatorRefSchema,
	summary: z.string().optional(),
	action_summary: nullableStringSchema.optional(),
	complexity: actionComplexityDocSchema.nullable().optional(),
	needs_reply: z.boolean().optional(),
	informational_reason: informationalReasonDocSchema.nullable().optional(),
});

const classificationTemplatePacketSchema = z.object({
	schema_version: z.literal(1).optional(),
	reviews: z.array(classificationTemplateReviewItemSchema).optional(),
	review_threads: z.array(classificationTemplateThreadItemSchema).optional(),
	discussion_comments: z.array(classificationTemplateDiscussionCommentItemSchema).optional(),
});

const classificationTemplateCountsSchema = z.object({
	reviews: z.int(),
	review_threads: z.int(),
	thread_comments: z.int(),
	discussion_comments: z.int(),
	resolved_review_threads_omitted: z.int(),
});

export const classificationTemplateResultDocSchema = z.object({
	manifest_kind: manifestKindSchema,
	pr_number: nullableIntSchema.optional(),
	payload_path: nullableStringSchema.optional(),
	counts: classificationTemplateCountsSchema,
	classification_template: classificationTemplatePacketSchema,
});

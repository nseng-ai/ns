import { z } from "zod";

import { bodyLocatorSchema } from "./feedback-manifest-contracts.ts";

export const ACTION_COMPLEXITIES = ["pre_existing", "local", "single_file", "cross_cutting", "complex"] as const;
/** Complexities whose plan batches require explicit approval before execution. */
export const APPROVAL_REQUIRED_COMPLEXITIES: ReadonlySet<ActionComplexity> = new Set(["cross_cutting", "complex"]);
export const INFORMATIONAL_THREAD_DECISIONS = ["act", "dismiss", "skip"] as const;
export const INFORMATIONAL_REASONS = [
	"resolved_reference",
	"automation",
	"acknowledgement",
	"approval",
	"question_only",
	"fyi",
	"noise",
	"already_addressed",
	"other",
] as const;

export const actionComplexitySchema = z.enum(ACTION_COMPLEXITIES);
export const informationalReasonSchema = z.enum(INFORMATIONAL_REASONS);
export const planSourceKindSchema = z.enum(["review", "review_thread", "discussion_comment"]);
export const feedbackManifestKindSchema = z.enum(["get_feedback", "prepare_run"]);
export const informationalThreadDecisionSchema = z.enum(INFORMATIONAL_THREAD_DECISIONS);

export const feedbackPlanCoveredCommentSchema = z.looseObject({
	comment_id: z.number().int(),
	author: z.string(),
	path: z.string(),
	line: z.number().int().nullable(),
	start_line: z.number().int().nullable(),
	body_locator: bodyLocatorSchema,
});

const nullableStringSchema = z.string().nullable().default(null);
const planItemCommonFields = {
	summary: z.string(),
	review_id: nullableStringSchema,
	review_state: nullableStringSchema,
	submitted_at: nullableStringSchema,
	thread_id: nullableStringSchema,
	discussion_comment_id: z.number().int().nullable().default(null),
	covered_comment_ids: z.array(z.number().int()).default([]),
	covered_comments: z.array(feedbackPlanCoveredCommentSchema).default([]),
	body_locator: bodyLocatorSchema.nullable().default(null),
	thread_item_pointer: nullableStringSchema,
	path: nullableStringSchema,
	line: z.number().int().nullable().default(null),
	start_line: z.number().int().nullable().default(null),
	is_outdated: z.boolean().nullable().default(null),
	author: nullableStringSchema,
	url: nullableStringSchema,
} as const;

const planActionItemFields = {
	...planItemCommonFields,
	action_summary: nullableStringSchema,
	complexity: actionComplexitySchema,
	pre_existing: z.boolean().default(false),
	needs_reply: z.boolean().nullable().default(null),
} as const;

const planInformationalItemFields = {
	...planItemCommonFields,
	informational_reason: informationalReasonSchema.nullable().default(null),
	user_decision_required: z.boolean().default(false),
	allowed_decisions: z.array(informationalThreadDecisionSchema).default([]),
} as const;

export const feedbackPlanReviewActionItemSchema = z.looseObject({
	source_kind: z.literal("review"),
	...planActionItemFields,
});

export const feedbackPlanThreadActionItemSchema = z.looseObject({
	source_kind: z.literal("review_thread"),
	...planActionItemFields,
});

export const feedbackPlanDiscussionActionItemSchema = z.looseObject({
	source_kind: z.literal("discussion_comment"),
	...planActionItemFields,
});

export const feedbackPlanActionItemSchema = z.discriminatedUnion("source_kind", [
	feedbackPlanReviewActionItemSchema,
	feedbackPlanThreadActionItemSchema,
	feedbackPlanDiscussionActionItemSchema,
]);

export const feedbackPlanReviewInformationalItemSchema = z.looseObject({
	source_kind: z.literal("review"),
	...planInformationalItemFields,
});

export const feedbackPlanThreadInformationalItemSchema = z.looseObject({
	source_kind: z.literal("review_thread"),
	...planInformationalItemFields,
});

export const feedbackPlanDiscussionInformationalItemSchema = z.looseObject({
	source_kind: z.literal("discussion_comment"),
	...planInformationalItemFields,
});

export const feedbackPlanInformationalItemSchema = z.discriminatedUnion("source_kind", [
	feedbackPlanReviewInformationalItemSchema,
	feedbackPlanThreadInformationalItemSchema,
	feedbackPlanDiscussionInformationalItemSchema,
]);

export const feedbackPlanBatchSchema = z.looseObject({
	batch_id: z.string(),
	complexity: actionComplexitySchema,
	approval_required: z.boolean(),
	items: z.array(feedbackPlanActionItemSchema).default([]),
});

export const feedbackPlanningValidationCountsSchema = z.object({
	reviews_expected: z.number().int(),
	reviews_classified: z.number().int(),
	review_threads_expected: z.number().int(),
	review_threads_classified: z.number().int(),
	thread_comments_expected: z.number().int(),
	thread_comments_covered: z.number().int(),
	discussion_comments_expected: z.number().int(),
	discussion_comments_classified: z.number().int(),
});

export const feedbackPlanningValidationErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	kind: z.enum(["review", "review_thread", "thread_comment", "discussion_comment", "packet"]),
	identifier: z.union([z.string(), z.number()]).nullable(),
	path: z.string().nullable(),
});

export const feedbackPlanningValidationResultSchema = z.object({
	valid: z.boolean(),
	manifest_kind: feedbackManifestKindSchema,
	pr_number: z.number().int().nullable(),
	payload_path: z.string().nullable(),
	counts: feedbackPlanningValidationCountsSchema,
	errors: z.array(feedbackPlanningValidationErrorSchema),
});

export const feedbackPlanCountsSchema = z.object({
	actionable_items: z.number().int(),
	informational_items: z.number().int(),
	batches: z.number().int(),
	approval_required_batches: z.number().int(),
	actionable_reviews: z.number().int(),
	actionable_review_threads: z.number().int(),
	actionable_discussion_comments: z.number().int(),
	informational_reviews: z.number().int(),
	informational_review_threads: z.number().int(),
	informational_discussion_comments: z.number().int(),
});

export const feedbackPlanResultSchema = z.looseObject({
	valid: z.boolean(),
	manifest_kind: feedbackManifestKindSchema,
	pr_number: z.number().int().nullable(),
	payload_path: z.string().nullable(),
	validation: feedbackPlanningValidationResultSchema,
	counts: feedbackPlanCountsSchema.nullable(),
	batches: z.array(feedbackPlanBatchSchema),
	informational: z.array(feedbackPlanInformationalItemSchema),
	warnings: z.array(z.string()),
});

export const feedbackPlanConsumerSchema = z.looseObject({
	valid: z.boolean(),
	manifest_kind: feedbackManifestKindSchema.optional(),
	pr_number: z.number().int().nullable().default(null),
	payload_path: nullableStringSchema,
	validation: feedbackPlanningValidationResultSchema.optional(),
	counts: feedbackPlanCountsSchema.nullable().optional(),
	batches: z.array(feedbackPlanBatchSchema).default([]),
	informational: z.array(feedbackPlanInformationalItemSchema).default([]),
	warnings: z.array(z.string()).default([]),
});

export type ActionComplexity = z.infer<typeof actionComplexitySchema>;
export type InformationalReason = z.infer<typeof informationalReasonSchema>;
export type PlanSourceKind = z.infer<typeof planSourceKindSchema>;
export type FeedbackManifestKind = z.infer<typeof feedbackManifestKindSchema>;
export type PlanDecision = z.infer<typeof informationalThreadDecisionSchema>;
export type FeedbackPlanCoveredComment = z.infer<typeof feedbackPlanCoveredCommentSchema>;
export type FeedbackPlanReviewActionItem = z.infer<typeof feedbackPlanReviewActionItemSchema>;
export type FeedbackPlanThreadActionItem = z.infer<typeof feedbackPlanThreadActionItemSchema>;
export type FeedbackPlanDiscussionActionItem = z.infer<typeof feedbackPlanDiscussionActionItemSchema>;
export type FeedbackPlanActionItem = z.infer<typeof feedbackPlanActionItemSchema>;
export type FeedbackPlanReviewInformationalItem = z.infer<typeof feedbackPlanReviewInformationalItemSchema>;
export type FeedbackPlanThreadInformationalItem = z.infer<typeof feedbackPlanThreadInformationalItemSchema>;
export type FeedbackPlanDiscussionInformationalItem = z.infer<typeof feedbackPlanDiscussionInformationalItemSchema>;
export type FeedbackPlanInformationalItem = z.infer<typeof feedbackPlanInformationalItemSchema>;
export type FeedbackPlanBatch = z.infer<typeof feedbackPlanBatchSchema>;
export type FeedbackPlanningValidationResult = z.infer<typeof feedbackPlanningValidationResultSchema>;
export type FeedbackPlanCounts = z.infer<typeof feedbackPlanCountsSchema>;
export type FeedbackPlanResult = z.infer<typeof feedbackPlanResultSchema>;
export type FeedbackPlanConsumer = z.infer<typeof feedbackPlanConsumerSchema>;

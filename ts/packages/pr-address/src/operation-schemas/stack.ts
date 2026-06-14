import { z } from "zod";

import {
	classificationTemplateResultDocSchema,
	feedbackClassificationValidationErrorSchema,
} from "./classification.ts";
import { mapBranchPrsSummarySchema } from "./collection.ts";
import { manifestBodyLocatorSchema, feedbackCountsSchema, getFeedbackPayloadManifestSchema } from "./manifest-mirrors.ts";
import { resolveThreadBatchPayloadSchema } from "./payload.ts";
import {
	discussionTriageReasonSchema,
	nullableBooleanSchema,
	nullableIntSchema,
	nullableStringSchema,
	payloadReferenceSchema,
	planSourceKindDocSchema,
} from "./shared.ts";

// --- build-stack-resolve-thread-payloads ----------------------------------------------

const buildStackResolveThreadPayloadsErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	batch_id: nullableStringSchema.optional(),
	pr_number: nullableIntSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	actual_pr_number: nullableIntSchema.optional(),
	actual_batch_id: nullableStringSchema.optional(),
});

const stackIgnoredNonThreadItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	source_kind: z.string(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	summary: z.string(),
});

const stackSkippedResolveThreadItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	thread_id: z.string(),
	skip_reason: z.string(),
	summary: z.string(),
});

const stackResolveThreadPayloadEntrySchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	batch_id: z.string(),
	source_batch_id: nullableStringSchema.optional(),
	payload_ready: z.boolean(),
	review_thread_count: z.int(),
	resolved_thread_count: z.int(),
	skipped_thread_count: z.int(),
	ignored_non_thread_items: z.array(stackIgnoredNonThreadItemSchema).optional(),
	skipped_items: z.array(stackSkippedResolveThreadItemSchema).optional(),
	payload: resolveThreadBatchPayloadSchema.nullable().optional(),
	warnings: z.array(z.string()).optional(),
});

export const buildStackResolveThreadPayloadsResultSchema = z.object({
	valid: z.boolean(),
	payloads_ready: z.boolean(),
	batch_id: z.string(),
	commit_sha: nullableStringSchema.optional(),
	continue_on_error: z.boolean().optional(),
	review_thread_count: z.int(),
	resolved_thread_count: z.int(),
	skipped_thread_count: z.int(),
	ignored_non_thread_items: z.array(stackIgnoredNonThreadItemSchema).optional(),
	skipped_items: z.array(stackSkippedResolveThreadItemSchema).optional(),
	payloads: z.array(stackResolveThreadPayloadEntrySchema).optional(),
	errors: z.array(buildStackResolveThreadPayloadsErrorSchema).optional(),
	warnings: z.array(z.string()).optional(),
});

// --- stack-feedback-diff-current ---------------------------------------------------

const stackFeedbackDiffPlannedThreadSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	thread_id: z.string(),
	source_batch_id: nullableStringSchema.optional(),
	summary: z.string(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: nullableBooleanSchema.optional(),
});

const stackFeedbackDiffCurrentThreadSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	thread_id: z.string(),
	path: z.string(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: z.boolean(),
	comment_count: z.int(),
});

const stackFeedbackDiffMissingOrOutdatedThreadSchema = stackFeedbackDiffPlannedThreadSchema.extend({
	reason: z.string(),
	changed_fields: z.array(z.string()).optional(),
});

const stackFeedbackDiffCurrentErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	pr_number: nullableIntSchema.optional(),
	thread_id: nullableStringSchema.optional(),
});

const stackFeedbackDiffCurrentSummarySchema = z.object({
	pr_count: z.int(),
	planned_actionable_review_threads: z.int(),
	planned_known_review_threads: z.int(),
	current_unresolved_review_threads: z.int(),
	planned_still_unresolved: z.int(),
	planned_already_resolved: z.int(),
	new_unresolved_threads: z.int(),
	missing_or_outdated_planned_threads: z.int(),
});

export const stackFeedbackDiffCurrentResultSchema = z.object({
	valid: z.boolean(),
	safe_to_resolve_planned: z.boolean(),
	planned_still_unresolved: z.array(stackFeedbackDiffPlannedThreadSchema).optional(),
	planned_already_resolved: z.array(stackFeedbackDiffPlannedThreadSchema).optional(),
	new_unresolved_threads: z.array(stackFeedbackDiffCurrentThreadSchema).optional(),
	missing_or_outdated_planned_threads: z.array(stackFeedbackDiffMissingOrOutdatedThreadSchema).optional(),
	warnings: z.array(z.string()).optional(),
	errors: z.array(stackFeedbackDiffCurrentErrorSchema).optional(),
	summary: stackFeedbackDiffCurrentSummarySchema,
	resolved_inputs: z.object({ stack_plan: payloadReferenceSchema, current_prep: payloadReferenceSchema }).optional(),
});

// --- stack-feedback-prep -----------------------------------------------------------

export const stackFeedbackPrepRequestSchema = z.object({
	stack_json: nullableStringSchema.optional(),
	stack_reference: nullableStringSchema.optional(),
	harness_session_id: nullableStringSchema.optional(),
	stdout_mode: z.enum(["full", "compact"]).optional(),
	include_resolved: z.boolean().optional(),
	include_empty_reviews: z.boolean().optional(),
});

const discussionTriageByReasonSchema = z.partialRecord(discussionTriageReasonSchema, z.int());

const stackDiscussionTriageItemSchema = z.object({
	comment_id: z.int(),
	author: z.string(),
	classification_hint: z.enum(["automation", "human_like", "needs_agent_review"]),
	reason: discussionTriageReasonSchema,
	body_locator: manifestBodyLocatorSchema,
});

const stackDiscussionTriageSummarySchema = z.object({
	automation_like: z.int(),
	human_like: z.int(),
	needs_agent_review: z.int(),
	by_reason: discussionTriageByReasonSchema,
	items: z.array(stackDiscussionTriageItemSchema).optional(),
});

const stackDiscussionTriageCompactSummarySchema = z.object({
	automation_like: z.int(),
	human_like: z.int(),
	needs_agent_review: z.int(),
	by_reason: discussionTriageByReasonSchema,
});

const stackFeedbackPrepPrResultSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	head_ref_name: nullableStringSchema.optional(),
	base_ref_name: nullableStringSchema.optional(),
	manifest: getFeedbackPayloadManifestSchema,
	manifest_summary_reference: payloadReferenceSchema,
	raw_feedback_reference: payloadReferenceSchema,
	classification_template: classificationTemplateResultDocSchema,
	classification_template_reference: payloadReferenceSchema,
	counts: feedbackCountsSchema,
	discussion_triage: stackDiscussionTriageSummarySchema,
});

const stackFeedbackPrepSummarySchema = z.object({
	prs: z.int(),
	reviews: z.int(),
	unresolved_review_threads: z.int(),
	discussion_comments: z.int(),
	automation_discussion_comments: z.int(),
	discussion_comments_needing_agent_review: z.int(),
});

const stackFeedbackPrepResultSchema = z.object({
	harness_session_id: z.string(),
	include_resolved: z.boolean().optional(),
	stack: z.array(stackFeedbackPrepPrResultSchema),
	stack_summary_reference: payloadReferenceSchema.nullable().optional(),
	summary: stackFeedbackPrepSummarySchema,
});

const stackFeedbackPrepCompactPrResultSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	head_ref_name: nullableStringSchema.optional(),
	base_ref_name: nullableStringSchema.optional(),
	counts: feedbackCountsSchema,
	raw_feedback_reference: payloadReferenceSchema,
	manifest_summary_reference: payloadReferenceSchema,
	classification_template_reference: payloadReferenceSchema,
	discussion_triage_summary: stackDiscussionTriageCompactSummarySchema,
});

const stackFeedbackPrepCompactResultSchema = z.object({
	harness_session_id: z.string(),
	include_resolved: z.boolean().optional(),
	summary: stackFeedbackPrepSummarySchema,
	stack_summary_reference: payloadReferenceSchema,
	stack: z.array(stackFeedbackPrepCompactPrResultSchema),
});

export const stackFeedbackPrepResultUnionSchema = z.union([stackFeedbackPrepResultSchema, stackFeedbackPrepCompactResultSchema]);

// --- stack-feedback-preflight ------------------------------------------------------

export const stackFeedbackPreflightRequestSchema = z.object({
	branches_json: nullableStringSchema.optional(),
	harness_session_id: nullableStringSchema.optional(),
	stdout_mode: z.enum(["full", "compact"]).optional(),
});

const stackFeedbackPreflightFullResultSchema = stackFeedbackPrepResultSchema.extend({
	mapping_summary: mapBranchPrsSummarySchema,
	stack_reference: payloadReferenceSchema,
});

const stackFeedbackPreflightCompactZeroPrSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
});

const stackFeedbackPreflightCompactResultSchema = z.object({
	harness_session_id: z.string(),
	mapping_summary: mapBranchPrsSummarySchema,
	stack_reference: payloadReferenceSchema,
	stack_summary_reference: payloadReferenceSchema,
	summary: stackFeedbackPrepSummarySchema,
	stack: z.array(stackFeedbackPrepCompactPrResultSchema),
	zero_feedback_prs: z.array(stackFeedbackPreflightCompactZeroPrSchema),
});

export const stackFeedbackPreflightResultUnionSchema = z.union([stackFeedbackPreflightFullResultSchema, stackFeedbackPreflightCompactResultSchema]);

// --- stack-feedback-plan -----------------------------------------------------------

export const stackFeedbackPlanRequestSchema = z.object({
	payload_json: nullableStringSchema.optional(),
	payload_file: nullableStringSchema.optional(),
	prep_reference: nullableStringSchema.optional(),
	harness_session_id: nullableStringSchema.optional(),
	stdout_mode: z.enum(["full", "compact"]).optional(),
});

const stackFeedbackPlanValidationPrResultSchema = z.object({
	pr_number: z.int(),
	valid: z.boolean(),
	counts: z.unknown(),
	errors: z.array(feedbackClassificationValidationErrorSchema).optional(),
});

const stackFeedbackPlanValidationSummarySchema = z.object({
	all_valid: z.boolean(),
	per_pr: z.array(stackFeedbackPlanValidationPrResultSchema),
});

const stackFeedbackPlanItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	source_batch_id: nullableStringSchema.optional(),
	source_kind: planSourceKindDocSchema,
	summary: z.string(),
	action_summary: nullableStringSchema.optional(),
	complexity: nullableStringSchema.optional(),
	approval_required: z.boolean().optional(),
	review_id: nullableStringSchema.optional(),
	review_state: nullableStringSchema.optional(),
	submitted_at: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	covered_comment_ids: z.array(z.int()).optional(),
	body_locator: manifestBodyLocatorSchema.nullable().optional(),
	thread_item_pointer: nullableStringSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: nullableBooleanSchema.optional(),
	author: nullableStringSchema.optional(),
	needs_reply: nullableBooleanSchema.optional(),
});

const stackFeedbackPlanBatchSchema = z.object({
	batch_id: z.string(),
	complexity: z.string(),
	approval_required: z.boolean(),
	items: z.array(stackFeedbackPlanItemSchema),
});

const stackFeedbackPlanInformationalItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	source_kind: planSourceKindDocSchema,
	summary: z.string(),
	informational_reason: z.string(),
	user_decision_required: z.boolean(),
	allowed_decisions: z.array(z.string()).optional(),
	review_id: nullableStringSchema.optional(),
	review_state: nullableStringSchema.optional(),
	submitted_at: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	covered_comment_ids: z.array(z.int()).optional(),
	body_locator: manifestBodyLocatorSchema.nullable().optional(),
	thread_item_pointer: nullableStringSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: nullableBooleanSchema.optional(),
	author: nullableStringSchema.optional(),
});

const stackFeedbackDecisionDocketItemSchema = z.object({
	decision_kind: z.enum([
		"approval_required_action",
		"informational_review_thread",
		"discussion_comment_action",
		"discussion_comment_review",
	]),
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	source_kind: planSourceKindDocSchema,
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	summary: z.string(),
	action_summary: nullableStringSchema.optional(),
	recommended_decision: z.string(),
	approval_required: z.boolean().optional(),
});

const stackFeedbackAutomationDiscussionSummarySchema = z.object({
	automation_like: z.int(),
	human_like: z.int(),
	needs_agent_review: z.int(),
	by_reason: discussionTriageByReasonSchema,
});

const stackFeedbackPlanSummarySchema = z.object({
	actionable_items: z.int(),
	approval_required_items: z.int(),
	informational_items: z.int(),
	automation_discussion_comments: z.int(),
});

const stackFeedbackPlanResolvedInputsSchema = z.object({
	prep: payloadReferenceSchema,
	classifications: z.array(z.object({ pr_number: z.int(), reference: payloadReferenceSchema })),
});

const stackFeedbackPlanResultSchema = z.object({
	valid: z.boolean(),
	harness_session_id: z.string(),
	pr_count: z.int(),
	validation: stackFeedbackPlanValidationSummarySchema,
	batches: z.array(stackFeedbackPlanBatchSchema).optional(),
	informational: z.array(stackFeedbackPlanInformationalItemSchema).optional(),
	automation_discussion_summary: stackFeedbackAutomationDiscussionSummarySchema.nullable().optional(),
	decision_docket: z.array(stackFeedbackDecisionDocketItemSchema).optional(),
	stack_plan_reference: payloadReferenceSchema.nullable().optional(),
	resolved_inputs: stackFeedbackPlanResolvedInputsSchema.optional(),
	summary: stackFeedbackPlanSummarySchema.nullable().optional(),
});

const stackFeedbackPlanCompactItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	source_kind: planSourceKindDocSchema,
	review_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	summary: z.string(),
	action_summary: nullableStringSchema.optional(),
	complexity: nullableStringSchema.optional(),
	approval_required: z.boolean().optional(),
});

const stackFeedbackPlanCompactBatchSchema = z.object({
	batch_id: z.string(),
	complexity: z.string(),
	approval_required: z.boolean(),
	item_count: z.int(),
	items: z.array(stackFeedbackPlanCompactItemSchema),
});

const stackFeedbackPlanCompactInformationalSummarySchema = z.object({
	total: z.int(),
	user_decision_required: z.int(),
	by_reason: z.record(z.string(), z.int()),
});

const stackFeedbackPlanCompactResultSchema = z.object({
	valid: z.boolean(),
	harness_session_id: z.string(),
	pr_count: z.int(),
	validation: stackFeedbackPlanValidationSummarySchema,
	batches: z.array(stackFeedbackPlanCompactBatchSchema).optional(),
	informational_summary: stackFeedbackPlanCompactInformationalSummarySchema.nullable().optional(),
	automation_discussion_summary: stackFeedbackAutomationDiscussionSummarySchema.nullable().optional(),
	decision_docket: z.array(stackFeedbackDecisionDocketItemSchema).optional(),
	stack_plan_reference: payloadReferenceSchema.nullable().optional(),
	resolved_inputs: stackFeedbackPlanResolvedInputsSchema.optional(),
	summary: stackFeedbackPlanSummarySchema.nullable().optional(),
});

export const stackFeedbackPlanResultUnionSchema = z.union([stackFeedbackPlanResultSchema, stackFeedbackPlanCompactResultSchema]);

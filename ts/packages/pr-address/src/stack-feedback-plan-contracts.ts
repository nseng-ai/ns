import { z } from "zod";

import type { FeedbackClassificationValidationError, FeedbackClassificationValidationResult } from "./classification.ts";
import { VOIDED_BY_STACK_WORK_BATCH_ID, feedbackPlanActionItemSchema, feedbackPlanInformationalItemSchema, feedbackPlanVoidedThreadItemSchema } from "./feedback-plan-contracts.ts";
import type { PayloadReference } from "./payload-store.ts";
import { nullableStringSchema, stackFeedbackPrepResultInputSchema, type StackFeedbackPrepResultInput } from "./stack-feedback-prep-contracts.ts";

export const stackFeedbackPlanInputSchema = z.looseObject({
	prep: stackFeedbackPrepResultInputSchema,
	classifications: z.array(z.looseObject({ pr_number: z.number().int(), classification: z.record(z.string(), z.unknown()) })),
});

const stackFeedbackPlanItemMetadataSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	source_batch_id: nullableStringSchema,
	approval_required: z.boolean().default(false),
});

export const stackFeedbackPlanActionItemSchema = feedbackPlanActionItemSchema.and(stackFeedbackPlanItemMetadataSchema);
export const stackFeedbackPlanInformationalItemSchema = feedbackPlanInformationalItemSchema.and(stackFeedbackPlanItemMetadataSchema);
export const stackFeedbackPlanVoidedThreadItemSchema = feedbackPlanVoidedThreadItemSchema
	.extend({ complexity: z.literal(VOIDED_BY_STACK_WORK_BATCH_ID) })
	.and(stackFeedbackPlanItemMetadataSchema);
export const stackFeedbackPlanResultItemSchema = z.union([stackFeedbackPlanActionItemSchema, stackFeedbackPlanInformationalItemSchema, stackFeedbackPlanVoidedThreadItemSchema]);
export const stackFeedbackPlanBatchSchema = z.looseObject({
	batch_id: z.string(),
	complexity: z.string(),
	approval_required: z.boolean(),
	items: z.array(stackFeedbackPlanResultItemSchema).default([]),
});
export const stackFeedbackPlanValidationPrSchema = z.looseObject({
	pr_number: z.number().int(),
	valid: z.boolean().default(true),
	counts: z.unknown().optional(),
	errors: z.array(z.unknown()).default([]),
});
export const stackFeedbackPlanValidationSummarySchema = z.looseObject({
	all_valid: z.boolean().default(true),
	per_pr: z.array(stackFeedbackPlanValidationPrSchema).default([]),
});
export const stackFeedbackPlanConsumerResultSchema = z.looseObject({
	valid: z.boolean(),
	harness_session_id: z.string().optional(),
	pr_count: z.number().int().default(0),
	validation: stackFeedbackPlanValidationSummarySchema,
	batches: z.array(stackFeedbackPlanBatchSchema).default([]),
	informational: z.array(stackFeedbackPlanResultItemSchema).default([]),
	automation_discussion_summary: z.unknown().optional(),
	decision_docket: z.array(z.unknown()).default([]),
	stack_plan_reference: z.unknown().nullable().optional(),
	summary: z.unknown().nullable().optional(),
});

export type StackFeedbackPlanInput = z.infer<typeof stackFeedbackPlanInputSchema>;
export type StackFeedbackPlanConsumerItem = z.infer<typeof stackFeedbackPlanResultItemSchema>;
export type StackFeedbackPlanConsumerResult = z.infer<typeof stackFeedbackPlanConsumerResultSchema>;
export type DecisionKind = "approval_required_action" | "informational_review_thread" | "discussion_comment_action" | "discussion_comment_review";

export interface StackFeedbackPlanValidationPrResult {
	pr_number: number;
	valid: boolean;
	counts: FeedbackClassificationValidationResult["counts"];
	errors: FeedbackClassificationValidationError[];
}

export interface StackFeedbackPlanValidationSummary {
	all_valid: boolean;
	per_pr: StackFeedbackPlanValidationPrResult[];
}

export interface StackFeedbackPlanItem {
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	source_batch_id: string | null;
	source_kind: string;
	summary: string;
	action_summary: string | null;
	complexity: string | null;
	approval_required: boolean;
	review_id: string | null;
	review_state: string | null;
	submitted_at: string | null;
	thread_id: string | null;
	discussion_comment_id: number | null;
	covered_comment_ids: number[];
	body_locator: unknown | null;
	thread_item_pointer: string | null;
	path: string | null;
	line: number | null;
	start_line: number | null;
	is_outdated: boolean | null;
	author: string | null;
	needs_reply: boolean | null;
}

export interface StackFeedbackPlanBatch {
	batch_id: string;
	complexity: string;
	approval_required: boolean;
	items: StackFeedbackPlanItem[];
}

export interface StackFeedbackPlanInformationalItem {
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	source_kind: string;
	summary: string;
	informational_reason: string;
	user_decision_required: boolean;
	allowed_decisions: string[];
	review_id: string | null;
	review_state: string | null;
	submitted_at: string | null;
	thread_id: string | null;
	discussion_comment_id: number | null;
	covered_comment_ids: number[];
	body_locator: unknown | null;
	thread_item_pointer: string | null;
	path: string | null;
	line: number | null;
	start_line: number | null;
	is_outdated: boolean | null;
	author: string | null;
}

export interface StackFeedbackDecisionDocketItem {
	decision_kind: DecisionKind;
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	source_kind: string;
	thread_id: string | null;
	discussion_comment_id: number | null;
	path: string | null;
	line: number | null;
	summary: string;
	action_summary: string | null;
	recommended_decision: string;
	approval_required: boolean;
}

export interface StackFeedbackAutomationDiscussionSummary {
	automation_like: number;
	human_like: number;
	needs_agent_review: number;
	by_reason: Record<string, number>;
}

export interface StackFeedbackPlanSummary {
	actionable_items: number;
	approval_required_items: number;
	informational_items: number;
	automation_discussion_comments: number;
	voided_by_stack_work_items?: number | undefined;
}

export interface StackFeedbackPlanResolvedClassificationInput {
	pr_number: number;
	reference: PayloadReference;
}

export interface StackFeedbackPlanResolvedInputs {
	prep: PayloadReference;
	classifications: StackFeedbackPlanResolvedClassificationInput[];
}

export interface StackFeedbackPlanResult {
	valid: boolean;
	harness_session_id: string;
	pr_count: number;
	validation: StackFeedbackPlanValidationSummary;
	batches: StackFeedbackPlanBatch[];
	informational: StackFeedbackPlanInformationalItem[];
	automation_discussion_summary: StackFeedbackAutomationDiscussionSummary | null;
	decision_docket: StackFeedbackDecisionDocketItem[];
	stack_plan_reference: PayloadReference | null;
	resolved_inputs?: StackFeedbackPlanResolvedInputs | undefined;
	summary: StackFeedbackPlanSummary | null;
}

export type StackFeedbackPlanPrepInput = StackFeedbackPrepResultInput;

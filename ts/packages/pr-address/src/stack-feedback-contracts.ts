import { z } from "zod";

import { bodyLocatorSchema } from "./feedback-manifest-contracts.ts";
import type { OperationPayloadField } from "./json-input.ts";
import type { PayloadReference } from "./payload-store.ts";

export const DIRECT_REQUEST_MARKERS = ["please", "can you", "could you", "should", "needs", "need to", "fix", "update", "question"] as const;

export const nullableStringSchema = z.string().nullable().default(null);

export const stackFeedbackPrInputSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
});

export const stackFeedbackPrepInputSchema = z.looseObject({
	stack: z.array(stackFeedbackPrInputSchema),
});

export const feedbackCountsSchema = z.looseObject({
	reviews: z.number().int(),
	review_threads: z.number().int(),
	unresolved_review_threads: z.number().int(),
	resolved_review_threads: z.number().int(),
	thread_comments: z.number().int(),
	discussion_comments: z.number().int(),
});

/** Typed window over the manifest this module builds itself via `buildGetFeedbackPayloadManifest`. */
export const prepManifestViewSchema = z.looseObject({
	counts: feedbackCountsSchema,
	discussion_comments: z.array(z.looseObject({ comment_id: z.number().int(), body_locator: bodyLocatorSchema })),
});

export const discussionTriageHintSchema = z.enum(["automation", "human_like", "needs_agent_review"]);
export const discussionTriageReasonSchema = z.enum([
	"vercel_status",
	"graphite_status",
	"roaster_summary",
	"github_actions_status",
	"bot_status",
	"human_like",
	"direct_request_possible",
	"uncertain",
]);

export const stackDiscussionTriageItemSchema = z.looseObject({
	comment_id: z.number().int(),
	author: z.string(),
	classification_hint: discussionTriageHintSchema,
	reason: discussionTriageReasonSchema,
	body_locator: z.unknown(),
});

export const stackPrepDiscussionTriageSchema = z.looseObject({
	automation_like: z.number().int().default(0),
	human_like: z.number().int().default(0),
	needs_agent_review: z.number().int().default(0),
	by_reason: z.record(z.string(), z.number().int()).default({}),
	items: z.array(stackDiscussionTriageItemSchema).default([]),
});

export const stackPrepPrResultSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
	manifest: z.unknown(),
	discussion_triage: stackPrepDiscussionTriageSchema,
});

export const stackPrepResultInputSchema = z.looseObject({
	payload_session_id: z.string(),
	include_resolved: z.boolean().default(false),
	stack: z.array(stackPrepPrResultSchema),
});

export const stackFeedbackPlanInputSchema = z.looseObject({
	prep: stackPrepResultInputSchema,
	classifications: z.array(z.looseObject({ pr_number: z.number().int(), classification: z.record(z.string(), z.unknown()) })),
});

/** Wire payload for stack-feedback-plan: `prep` may be omitted when `--prep-reference` supplies it. */
export const stackFeedbackPlanPayloadSchema = stackFeedbackPlanInputSchema.extend({
	prep: stackPrepResultInputSchema.optional(),
});
export type StackFeedbackPlanPayload = z.infer<typeof stackFeedbackPlanPayloadSchema>;
export const stackFeedbackPlanPayloadFields = [
	{
		key: "prep",
		artifactDescription: "the stack-feedback-prep data object",
		referenceSchema: stackPrepResultInputSchema,
	},
] as const satisfies readonly OperationPayloadField<StackFeedbackPlanPayload, keyof StackFeedbackPlanPayload & string>[];

export type StackFeedbackPrInput = z.infer<typeof stackFeedbackPrInputSchema>;
export type StackPrepPrResultInput = z.infer<typeof stackPrepPrResultSchema>;
export type StackPrepResultInput = z.infer<typeof stackPrepResultInputSchema>;
export type StackFeedbackPlanInput = z.infer<typeof stackFeedbackPlanInputSchema>;
export type FeedbackCounts = z.infer<typeof feedbackCountsSchema>;

export type DiscussionTriageHint = z.infer<typeof discussionTriageHintSchema>;
export type DiscussionTriageReason = z.infer<typeof discussionTriageReasonSchema>;
export type DecisionKind = "approval_required_action" | "informational_review_thread" | "discussion_comment_action" | "discussion_comment_review";

export interface StackDiscussionTriageItem {
	comment_id: number;
	author: string;
	classification_hint: DiscussionTriageHint;
	reason: DiscussionTriageReason;
	body_locator: unknown;
}

export interface StackDiscussionTriageSummary {
	automation_like: number;
	human_like: number;
	needs_agent_review: number;
	by_reason: Record<string, number>;
	items: StackDiscussionTriageItem[];
}

export interface StackFeedbackPrepPrResult {
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
	manifest: unknown;
	manifest_summary_reference: PayloadReference;
	raw_feedback_reference: PayloadReference;
	classification_template: unknown;
	classification_template_reference: PayloadReference;
	counts: FeedbackCounts;
	discussion_triage: StackDiscussionTriageSummary;
}

export interface StackFeedbackPrepSummary {
	prs: number;
	reviews: number;
	unresolved_review_threads: number;
	discussion_comments: number;
	automation_discussion_comments: number;
	discussion_comments_needing_agent_review: number;
}

export interface StackFeedbackPrepResult {
	payload_session_id: string;
	include_resolved: boolean;
	stack: StackFeedbackPrepPrResult[];
	stack_summary_reference: PayloadReference | null;
	summary: StackFeedbackPrepSummary;
}

export interface StackFeedbackPlanValidationPrResult {
	pr_number: number;
	valid: boolean;
	counts: import("./classification-validation.ts").FeedbackClassificationValidationResult["counts"];
	errors: import("./classification-shared.ts").FeedbackClassificationValidationError[];
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
}

export interface StackFeedbackPlanResult {
	valid: boolean;
	payload_session_id: string;
	pr_count: number;
	validation: StackFeedbackPlanValidationSummary;
	batches: StackFeedbackPlanBatch[];
	informational: StackFeedbackPlanInformationalItem[];
	automation_discussion_summary: StackFeedbackAutomationDiscussionSummary | null;
	decision_docket: StackFeedbackDecisionDocketItem[];
	stack_plan_reference: PayloadReference | null;
	summary: StackFeedbackPlanSummary | null;
}

export function triageSummary(items: StackDiscussionTriageItem[]): StackDiscussionTriageSummary {
	const byReason: Record<string, number> = {};
	for (const item of items) byReason[item.reason] = (byReason[item.reason] ?? 0) + 1;
	return {
		automation_like: items.filter((item) => item.classification_hint === "automation").length,
		human_like: items.filter((item) => item.classification_hint === "human_like").length,
		needs_agent_review: items.filter((item) => item.classification_hint === "needs_agent_review").length,
		by_reason: byReason,
		items,
	};
}

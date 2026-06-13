import { z } from "zod";

import { bodyLocatorSchema, payloadReferenceSchema } from "./feedback-manifest-contracts.ts";
import type { PayloadReference } from "./payload-store.ts";
import { stackDiscussionTriageSummarySchema, type StackDiscussionTriageSummary } from "./stack-feedback-triage.ts";

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

export const stackFeedbackPrepPrConsumerSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
	manifest: z.unknown(),
	manifest_summary_reference: payloadReferenceSchema.optional(),
	raw_feedback_reference: payloadReferenceSchema.optional(),
	classification_template: z.unknown().optional(),
	classification_template_reference: payloadReferenceSchema.optional(),
	counts: feedbackCountsSchema.optional(),
	discussion_triage: stackDiscussionTriageSummarySchema,
});

export const stackFeedbackPrepConsumerSchema = z.looseObject({
	harness_session_id: z.string().optional(),
	include_resolved: z.boolean().default(false),
	stack: z.array(stackFeedbackPrepPrConsumerSchema).default([]),
	stack_summary_reference: payloadReferenceSchema.nullable().optional(),
	summary: z.unknown().optional(),
});

export const stackFeedbackPrepResultInputSchema = stackFeedbackPrepConsumerSchema.extend({
	harness_session_id: z.string(),
	stack: z.array(stackFeedbackPrepPrConsumerSchema),
});

export const stackFeedbackPrepThreadManifestItemSchema = z.looseObject({
	thread_id: z.string(),
	path: z.string(),
	line: z.number().int().nullable().default(null),
	start_line: z.number().int().nullable().default(null),
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comment_count: z.number().int().default(0),
});

export const stackFeedbackPrepPrWithManifestSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema.optional(),
	base_ref_name: nullableStringSchema.optional(),
	manifest: z.looseObject({ review_threads: z.array(stackFeedbackPrepThreadManifestItemSchema).default([]) }),
});

export const stackFeedbackPrepResultWithManifestSchema = z.looseObject({
	harness_session_id: z.string().optional(),
	include_resolved: z.boolean().default(false),
	stack: z.array(stackFeedbackPrepPrWithManifestSchema).default([]),
	stack_summary_reference: payloadReferenceSchema.nullable().optional(),
	summary: z.unknown().optional(),
});

export type StackFeedbackPrInput = z.infer<typeof stackFeedbackPrInputSchema>;
export type FeedbackCounts = z.infer<typeof feedbackCountsSchema>;
export type StackFeedbackPrepPrResultInput = z.infer<typeof stackFeedbackPrepPrConsumerSchema>;
export type StackFeedbackPrepResultInput = z.infer<typeof stackFeedbackPrepResultInputSchema>;
export type StackFeedbackPrepResultWithManifest = z.infer<typeof stackFeedbackPrepResultWithManifestSchema>;
export type StackFeedbackPrepPrWithManifest = z.infer<typeof stackFeedbackPrepPrWithManifestSchema>;
export type StackFeedbackPrepThreadManifestItem = z.infer<typeof stackFeedbackPrepThreadManifestItemSchema>;

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
	harness_session_id: string;
	include_resolved: boolean;
	stack: StackFeedbackPrepPrResult[];
	stack_summary_reference: PayloadReference | null;
	summary: StackFeedbackPrepSummary;
}

export interface StackFeedbackPrepCompactPrResult {
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
	counts: FeedbackCounts;
	raw_feedback_reference: PayloadReference;
	manifest_summary_reference: PayloadReference;
	classification_template_reference: PayloadReference;
	discussion_triage_summary: {
		automation_like: number;
		human_like: number;
		needs_agent_review: number;
		by_reason: Record<string, number>;
	};
}

export interface StackFeedbackPrepCompactResult {
	harness_session_id: string;
	include_resolved: boolean;
	summary: StackFeedbackPrepSummary;
	stack_summary_reference: PayloadReference;
	stack: StackFeedbackPrepCompactPrResult[];
}

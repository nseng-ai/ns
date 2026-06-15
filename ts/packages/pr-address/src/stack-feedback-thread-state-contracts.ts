import { z } from "zod";

import { payloadReferenceSchema } from "./feedback-manifest-contracts.ts";
import { nullableStringSchema } from "./stack-feedback-prep-contracts.ts";

export const stackFeedbackThreadStateThreadSchema = z.looseObject({
	thread_id: z.string(),
	path: z.string(),
	line: z.number().int().nullable().default(null),
	start_line: z.number().int().nullable().default(null),
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comment_count: z.number().int(),
});

export const stackFeedbackThreadStateCountsSchema = z.looseObject({
	review_threads: z.number().int(),
	unresolved_review_threads: z.number().int(),
	resolved_review_threads: z.number().int(),
});

export const stackFeedbackThreadStateSummarySchema = z.looseObject({
	prs: z.number().int(),
	review_threads: z.number().int(),
	unresolved_review_threads: z.number().int(),
	resolved_review_threads: z.number().int(),
});

export const stackFeedbackThreadStatePrResultSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
	review_threads: z.array(stackFeedbackThreadStateThreadSchema),
	counts: stackFeedbackThreadStateCountsSchema,
});

export const stackFeedbackThreadStateResultSchema = z.looseObject({
	harness_session_id: z.string(),
	include_resolved: z.literal(true),
	stack: z.array(stackFeedbackThreadStatePrResultSchema),
	stack_thread_state_reference: payloadReferenceSchema.nullable(),
	summary: stackFeedbackThreadStateSummarySchema,
});

export type StackFeedbackThreadStateThread = z.infer<typeof stackFeedbackThreadStateThreadSchema>;
export type StackFeedbackThreadStateCounts = z.infer<typeof stackFeedbackThreadStateCountsSchema>;
export type StackFeedbackThreadStateSummary = z.infer<typeof stackFeedbackThreadStateSummarySchema>;
export type StackFeedbackThreadStatePrResult = z.infer<typeof stackFeedbackThreadStatePrResultSchema>;
export type StackFeedbackThreadStateResult = z.infer<typeof stackFeedbackThreadStateResultSchema>;

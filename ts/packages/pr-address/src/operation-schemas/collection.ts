import { z } from "zod";

const nullableIntSchema = z.int().nullable();
const nullableStringSchema = z.string().nullable();

export const mapBranchPrsRequestSchema = z.object({
	branchesJson: z.string().optional(),
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

export const downloadFeedbackRequestSchema = z.object({
	prNumber: z.int().optional(),
	includeResolved: z.boolean().optional(),
	includeAutomation: z.boolean().optional(),
	includeEmptyReviews: z.boolean().optional(),
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

export const prDetailsRequestSchema = z.object({ pr_number: z.int() });
export const branchPrRequestSchema = z.object({ branch: z.string() });
export const emptyRequestSchema = z.object({});
export const prReviewThreadsRequestSchema = z.object({
	pr_number: z.int(),
	include_resolved: z.boolean().optional(),
});
export const replyReviewThreadRequestSchema = z.object({
	thread_id: z.string(),
	body: z.string(),
});
export const resolveReviewThreadRequestSchema = z.object({ thread_id: z.string() });

const prSummarySchema = z.object({
	number: z.int(),
	title: z.string(),
	url: z.string(),
	head_ref_name: z.string(),
	base_ref_name: z.string(),
	state: z.string(),
	head_ref_oid: nullableStringSchema,
});

const lookupMissSchema = z.object({ stderr: z.string(), returncode: z.int() });

export const prLookupResultSchema = z.object({
	found: z.boolean(),
	pr: prSummarySchema.nullable(),
	miss: lookupMissSchema.nullable(),
});

export const openPrsResultSchema = z.object({ prs: z.array(prSummarySchema) });

const prReviewSchema = z.object({
	id: z.string(),
	author: z.string(),
	body: z.string(),
	state: z.string(),
	submitted_at: z.string(),
});

export const prReviewsResultSchema = z.object({ reviews: z.array(prReviewSchema) });

const prReviewCommentSchema = z.object({
	id: z.int(),
	body: z.string(),
	author: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	created_at: z.string(),
	url: z.string().optional(),
});

const prReviewThreadSchema = z.object({
	id: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comments: z.array(prReviewCommentSchema),
});

export const prReviewThreadsResultSchema = z.object({
	review_threads: z.array(prReviewThreadSchema),
});

const prDiscussionCommentSchema = z.object({
	id: z.int(),
	body: z.string(),
	author: z.string(),
	url: z.string(),
});

export const prDiscussionCommentsResultSchema = z.object({
	discussion_comments: z.array(prDiscussionCommentSchema),
});

export const replyReviewThreadResultSchema = z.object({
	thread_id: z.string(),
	comment: prReviewCommentSchema,
});

export const resolveReviewThreadResultSchema = z.object({
	thread_id: z.string(),
	is_resolved: z.boolean(),
});

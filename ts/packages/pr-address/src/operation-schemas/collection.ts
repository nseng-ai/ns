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

import { z } from "zod";
import { githubPrFeedbackFailureSchema } from "@nseng-ai/capability-kit/github/pr-feedback";

import {
	nullableIntSchema,
	nullableStringSchema,
	prTargetPayloadSchema,
} from "../core/pr-target-payload.ts";

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
	branchPrs: z.array(mapBranchPrsEntrySchema),
	missingBranches: z.array(z.string()),
	ambiguousBranches: z.array(ambiguousBranchPrsEntrySchema),
	summary: mapBranchPrsSummarySchema,
});

const prCheckBucketSchema = z.union([
	z.literal("passing"),
	z.literal("pending"),
	z.literal("failing"),
	z.literal("cancelled"),
	z.literal("unknown"),
]);

export const prCheckEntrySchema = z.object({
	bucket: prCheckBucketSchema,
	kind: z.union([z.literal("check_run"), z.literal("status_context"), z.literal("unknown")]),
	name: z.string(),
	workflow_name: nullableStringSchema,
	status: nullableStringSchema,
	conclusion: nullableStringSchema,
	state: nullableStringSchema,
	started_at: nullableStringSchema,
	completed_at: nullableStringSchema,
	created_at: nullableStringSchema,
	details_url: nullableStringSchema,
	target_url: nullableStringSchema,
	identity: nullableStringSchema,
});

const prChecksCountsSchema = z.object({
	passing: z.int(),
	pending: z.int(),
	failing: z.int(),
	cancelled: z.int(),
	unknown: z.int(),
	hasMore: z.boolean(),
});

export const prChecksResultSchema = z.object({
	found: z.boolean(),
	target: prTargetPayloadSchema,
	counts: prChecksCountsSchema,
	checks: z.array(prCheckEntrySchema),
});

const branchPrChecksFoundEntrySchema = z.object({
	branch: z.string(),
	status: z.literal("found"),
	target: prTargetPayloadSchema,
	counts: prChecksCountsSchema,
	checks: z.array(prCheckEntrySchema),
});

const branchPrChecksMissingEntrySchema = z.object({
	branch: z.string(),
	status: z.literal("missing"),
});

const branchPrChecksAmbiguousEntrySchema = z.object({
	branch: z.string(),
	status: z.literal("ambiguous"),
	candidates: z.array(mapBranchPrsEntrySchema),
});

export const branchPrChecksResultSchema = z.object({
	entries: z.array(
		z.discriminatedUnion("status", [
			branchPrChecksFoundEntrySchema,
			branchPrChecksMissingEntrySchema,
			branchPrChecksAmbiguousEntrySchema,
		]),
	),
	summary: mapBranchPrsSummarySchema,
});

const downloadFeedbackCountsSchema = z.object({
	includedReviewThreads: z.int(),
	includedReviews: z.int(),
	includedDiscussionComments: z.int(),
	excludedResolvedThreads: z.int(),
	excludedEmptyReviews: z.int(),
	excludedAutomationComments: z.int(),
});

export const downloadFeedbackResultSchema = z.object({
	found: z.boolean(),
	target: prTargetPayloadSchema,
	counts: downloadFeedbackCountsSchema,
	bodyMarkdown: z.string(),
	markdown: z.string(),
});

export const prSummarySchema = z.object({
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

export const prReviewSchema = z.object({
	id: z.string(),
	author: z.string(),
	body: z.string(),
	state: z.string(),
	submitted_at: z.string().nullable(),
});

export const prReviewsResultSchema = z.object({ reviews: z.array(prReviewSchema) });

export const prReviewCommentSchema = z.object({
	id: z.int(),
	body: z.string(),
	author: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	created_at: z.string(),
	url: z.string().optional(),
});

export const prReviewThreadSchema = z.object({
	id: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comments: z.array(prReviewCommentSchema),
});

export const prReviewThreadsResultSchema = z.object({
	reviewThreads: z.array(prReviewThreadSchema),
});

export const prDiscussionCommentSchema = z.object({
	id: z.int(),
	body: z.string(),
	author: z.string(),
	url: z.string(),
});

export const prDiscussionCommentsResultSchema = z.object({
	discussionComments: z.array(prDiscussionCommentSchema),
});

export const replyReviewThreadResultSchema = z.object({
	thread_id: z.string(),
	comment: prReviewCommentSchema,
});

export const resolveReviewThreadResultSchema = z.object({
	thread_id: z.string(),
	is_resolved: z.boolean(),
});

const closeReviewThreadsEntryErrorSchema = z.object({
	stage: z.union([z.literal("reply"), z.literal("resolve")]),
	message: z.string(),
	code: z.string(),
	failure: githubPrFeedbackFailureSchema,
});

const closeReviewThreadsEntrySchema = z.object({
	thread_id: z.string(),
	reply: replyReviewThreadResultSchema.nullable(),
	resolution: resolveReviewThreadResultSchema.nullable(),
	error: closeReviewThreadsEntryErrorSchema.nullable(),
});

export const closeReviewThreadsResultSchema = z.object({
	requested: z.int(),
	replied: z.int(),
	resolved: z.int(),
	failed: z.int(),
	entries: z.array(closeReviewThreadsEntrySchema),
	summary: z.object({ succeeded: z.int(), failed: z.int() }),
});

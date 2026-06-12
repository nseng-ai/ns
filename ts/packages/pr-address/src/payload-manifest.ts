import { z } from "zod";

import type { PRDiscussionComment, PRReview, PRReviewThread, RestructuredFile } from "./gateways.ts";
const payloadReferenceSchema = z.looseObject({
	payload_path: z.string(),
});

const reviewSchema = z.looseObject({
	id: z.string(),
	author: z.string(),
	body: z.string(),
	state: z.string(),
	submitted_at: z.string(),
});

const reviewCommentSchema = z.looseObject({
	id: z.number().int(),
	body: z.string(),
	author: z.string(),
	path: z.string(),
	line: z.number().int().nullable().default(null),
	start_line: z.number().int().nullable().default(null),
	created_at: z.string(),
});

const reviewThreadSchema = z.looseObject({
	id: z.string(),
	path: z.string(),
	line: z.number().int().nullable().default(null),
	start_line: z.number().int().nullable().default(null),
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comments: z.array(reviewCommentSchema).default([]),
});

const discussionCommentSchema = z.looseObject({
	id: z.number().int(),
	body: z.string(),
	author: z.string(),
	url: z.string(),
});

export const getFeedbackPayloadManifestInputSchema = z.looseObject({
	payload_reference: payloadReferenceSchema,
	pr_number: z.number().int(),
	reviews: z.array(reviewSchema).default([]),
	review_threads: z.array(reviewThreadSchema).default([]),
	discussion_comments: z.array(discussionCommentSchema).default([]),
});

export const prepareRunPayloadManifestInputSchema = z.looseObject({
	payload_reference: payloadReferenceSchema,
	found: z.boolean(),
	current_branch: z.string().nullable().default(null),
	number: z.number().int().nullable().default(null),
	title: z.string().nullable().default(null),
	url: z.string().nullable().default(null),
	head_ref_name: z.string().nullable().default(null),
	base_ref_name: z.string().nullable().default(null),
	state: z.string().nullable().default(null),
	reviews: z.array(reviewSchema).default([]),
	review_threads: z.array(reviewThreadSchema).default([]),
	discussion_comments: z.array(discussionCommentSchema).default([]),
	reopened_thread_ids: z.array(z.string()).default([]),
	restructured_files: z.array(z.unknown()).default([]),
	warnings: z.array(z.string()).default([]),
	error: z.string().nullable().default(null),
	returncode: z.number().int().nullable().default(null),
});

interface PayloadReference {
	payload_path: string;
}
type Review = PRReview;
type ReviewComment = PRReviewThread["comments"][number];
type ReviewThread = PRReviewThread;
type DiscussionComment = PRDiscussionComment;
interface GetFeedbackPayloadManifestInput {
	payload_reference: PayloadReference;
	pr_number: number;
	reviews: readonly PRReview[];
	review_threads: readonly PRReviewThread[];
	discussion_comments: readonly PRDiscussionComment[];
}
interface PrepareRunPayloadManifestInput {
	payload_reference: PayloadReference;
	found: boolean;
	current_branch?: string | null | undefined;
	number?: number | null | undefined;
	title?: string | null | undefined;
	url?: string | null | undefined;
	head_ref_name?: string | null | undefined;
	base_ref_name?: string | null | undefined;
	state?: string | null | undefined;
	reviews?: readonly PRReview[] | undefined;
	review_threads?: readonly PRReviewThread[] | undefined;
	discussion_comments?: readonly PRDiscussionComment[] | undefined;
	reopened_thread_ids?: readonly string[] | undefined;
	restructured_files?: readonly RestructuredFile[] | undefined;
	warnings?: readonly string[] | undefined;
	error?: string | null | undefined;
	returncode?: number | null | undefined;
}

interface FeedbackCounts {
	reviews: number;
	review_threads: number;
	unresolved_review_threads: number;
	resolved_review_threads: number;
	thread_comments: number;
	discussion_comments: number;
}

interface FeedbackCollections {
	reviews: readonly Review[];
	review_threads: readonly ReviewThread[];
	discussion_comments: readonly DiscussionComment[];
}

export function buildGetFeedbackPayloadManifest(input: GetFeedbackPayloadManifestInput): unknown {
	return {
		payload_mode: "payload",
		payload_reference: input.payload_reference,
		pr_number: input.pr_number,
		counts: feedbackCounts(input),
		reviews: reviewManifestItems(input.reviews),
		review_threads: threadManifestItems(input.review_threads),
		discussion_comments: discussionManifestItems(input.discussion_comments),
	};
}

export function buildPrepareRunPayloadManifest(input: PrepareRunPayloadManifestInput): unknown {
	const reviews = input.reviews ?? [];
	const reviewThreads = input.review_threads ?? [];
	const discussionComments = input.discussion_comments ?? [];
	return {
		payload_mode: "payload",
		payload_reference: input.payload_reference,
		found: input.found,
		current_branch: input.current_branch ?? null,
		number: input.number ?? null,
		title: input.title ?? null,
		url: input.url ?? null,
		head_ref_name: input.head_ref_name ?? null,
		base_ref_name: input.base_ref_name ?? null,
		state: input.state ?? null,
		counts: input.found ? feedbackCounts({ reviews, review_threads: reviewThreads, discussion_comments: discussionComments }) : null,
		reviews: reviewManifestItems(reviews),
		review_threads: threadManifestItems(reviewThreads),
		discussion_comments: discussionManifestItems(discussionComments),
		reopened_thread_ids: [...(input.reopened_thread_ids ?? [])],
		restructured_files: [...(input.restructured_files ?? [])],
		warnings: [...(input.warnings ?? [])],
		error: input.error ?? null,
		returncode: input.returncode ?? null,
	};
}

function feedbackCounts(input: FeedbackCollections): FeedbackCounts {
	const resolvedCount = input.review_threads.filter((thread) => thread.is_resolved).length;
	return {
		reviews: input.reviews.length,
		review_threads: input.review_threads.length,
		unresolved_review_threads: input.review_threads.length - resolvedCount,
		resolved_review_threads: resolvedCount,
		thread_comments: input.review_threads.reduce((total, thread) => total + thread.comments.length, 0),
		discussion_comments: input.discussion_comments.length,
	};
}

function reviewManifestItems(reviews: readonly Review[]): unknown[] {
	return reviews.map((review, reviewIndex) => {
		const itemPointer = `/data/reviews/${reviewIndex}`;
		return {
			id: review.id,
			author: review.author,
			state: review.state,
			submitted_at: review.submitted_at,
			body_locator: {
				body_chars: review.body.length,
				json_pointer: `${itemPointer}/body`,
				item_pointer: itemPointer,
				domain: feedbackDomainLocator({ kind: "review", review_id: review.id, author: review.author }),
			},
		};
	});
}

function threadManifestItems(reviewThreads: readonly ReviewThread[]): unknown[] {
	return reviewThreads.map((thread, threadIndex) => {
		const itemPointer = `/data/review_threads/${threadIndex}`;
		return {
			thread_id: thread.id,
			path: thread.path,
			line: thread.line,
			start_line: thread.start_line,
			is_resolved: thread.is_resolved,
			is_outdated: thread.is_outdated,
			comment_count: thread.comments.length,
			item_pointer: itemPointer,
			comments: threadCommentManifestItems(thread, threadIndex),
		};
	});
}

function threadCommentManifestItems(thread: ReviewThread, threadIndex: number): unknown[] {
	return thread.comments.map((comment, commentIndex) => {
		const itemPointer = `/data/review_threads/${threadIndex}/comments/${commentIndex}`;
		return {
			id: comment.id,
			author: comment.author,
			path: comment.path,
			line: comment.line,
			start_line: comment.start_line,
			created_at: comment.created_at,
			body_locator: threadCommentBodyLocator({ comment, thread, commentIndex, itemPointer }),
		};
	});
}

function threadCommentBodyLocator(options: { comment: ReviewComment; thread: ReviewThread; commentIndex: number; itemPointer: string }): unknown {
	return {
		body_chars: options.comment.body.length,
		json_pointer: `${options.itemPointer}/body`,
		item_pointer: options.itemPointer,
		domain: feedbackDomainLocator({
			kind: "review_thread_comment",
			thread_id: options.thread.id,
			comment_id: options.comment.id,
			comment_index: options.commentIndex,
			path: options.comment.path,
			line: options.comment.line,
			start_line: options.comment.start_line,
			is_resolved: options.thread.is_resolved,
			is_outdated: options.thread.is_outdated,
			author: options.comment.author,
		}),
	};
}

function discussionManifestItems(discussionComments: readonly DiscussionComment[]): unknown[] {
	return discussionComments.map((comment, commentIndex) => {
		const itemPointer = `/data/discussion_comments/${commentIndex}`;
		return {
			comment_id: comment.id,
			author: comment.author,
			url: comment.url,
			body_locator: {
				body_chars: comment.body.length,
				json_pointer: `${itemPointer}/body`,
				item_pointer: itemPointer,
				domain: feedbackDomainLocator({ kind: "discussion_comment", discussion_comment_id: comment.id, author: comment.author }),
			},
		};
	});
}

function feedbackDomainLocator(fields: Partial<Record<string, unknown>> & { kind: string }): Record<string, unknown> {
	return {
		kind: fields.kind,
		review_id: fields.review_id ?? null,
		thread_id: fields.thread_id ?? null,
		comment_id: fields.comment_id ?? null,
		discussion_comment_id: fields.discussion_comment_id ?? null,
		comment_index: fields.comment_index ?? null,
		path: fields.path ?? null,
		line: fields.line ?? null,
		start_line: fields.start_line ?? null,
		is_resolved: fields.is_resolved ?? null,
		is_outdated: fields.is_outdated ?? null,
		author: fields.author ?? null,
	};
}

export type { PayloadReference };

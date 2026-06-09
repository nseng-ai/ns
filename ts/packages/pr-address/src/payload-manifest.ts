import { z } from "zod";

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

type PayloadReference = z.infer<typeof payloadReferenceSchema>;
type Review = z.infer<typeof reviewSchema>;
type ReviewComment = z.infer<typeof reviewCommentSchema>;
type ReviewThread = z.infer<typeof reviewThreadSchema>;
type DiscussionComment = z.infer<typeof discussionCommentSchema>;
type GetFeedbackPayloadManifestInput = z.infer<typeof getFeedbackPayloadManifestInputSchema>;
type PrepareRunPayloadManifestInput = z.infer<typeof prepareRunPayloadManifestInputSchema>;

interface FeedbackCounts {
	reviews: number;
	review_threads: number;
	unresolved_review_threads: number;
	resolved_review_threads: number;
	thread_comments: number;
	discussion_comments: number;
}

export function buildGetFeedbackPayloadManifest(input: unknown): unknown {
	const parsed = getFeedbackPayloadManifestInputSchema.parse(input);
	return {
		payload_mode: "payload",
		payload_reference: parsed.payload_reference,
		pr_number: parsed.pr_number,
		counts: feedbackCounts(parsed),
		reviews: reviewManifestItems(parsed.reviews),
		review_threads: threadManifestItems(parsed.review_threads),
		discussion_comments: discussionManifestItems(parsed.discussion_comments),
	};
}

export function buildPrepareRunPayloadManifest(input: unknown): unknown {
	const parsed = prepareRunPayloadManifestInputSchema.parse(input);
	return {
		payload_mode: "payload",
		payload_reference: parsed.payload_reference,
		found: parsed.found,
		current_branch: parsed.current_branch,
		number: parsed.number,
		title: parsed.title,
		url: parsed.url,
		head_ref_name: parsed.head_ref_name,
		base_ref_name: parsed.base_ref_name,
		state: parsed.state,
		counts: parsed.found ? feedbackCounts(parsed) : null,
		reviews: reviewManifestItems(parsed.reviews),
		review_threads: threadManifestItems(parsed.review_threads),
		discussion_comments: discussionManifestItems(parsed.discussion_comments),
		reopened_thread_ids: [...parsed.reopened_thread_ids],
		restructured_files: [...parsed.restructured_files],
		warnings: [...parsed.warnings],
		error: parsed.error,
		returncode: parsed.returncode,
	};
}

function feedbackCounts(input: Pick<GetFeedbackPayloadManifestInput | PrepareRunPayloadManifestInput, "reviews" | "review_threads" | "discussion_comments">): FeedbackCounts {
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

import { z } from "zod";

export const payloadReferenceSchema = z.object({
	payload_path: z.string(),
	session_id: z.string().optional(),
	descriptor: z.string().optional(),
	role: z.string().optional(),
	created_at_utc: z.string().optional(),
	sequence: z.number().int().optional(),
	payload_bytes: z.number().int().optional(),
	content_type: z.string().optional(),
	extension: z.string().optional(),
});

export const feedbackDomainLocatorSchema = z.looseObject({
	kind: z.string(),
	review_id: z.string().nullable().default(null),
	thread_id: z.string().nullable().default(null),
	comment_id: z.number().int().nullable().default(null),
	discussion_comment_id: z.number().int().nullable().default(null),
	comment_index: z.number().int().nullable().default(null),
	path: z.string().nullable().default(null),
	line: z.number().int().nullable().default(null),
	start_line: z.number().int().nullable().default(null),
	is_resolved: z.boolean().nullable().default(null),
	is_outdated: z.boolean().nullable().default(null),
	author: z.string().nullable().default(null),
});

export const bodyLocatorSchema = z.looseObject({
	body_chars: z.number().int(),
	json_pointer: z.string(),
	item_pointer: z.string().nullable().default(null),
	domain: feedbackDomainLocatorSchema,
});

export const reviewManifestItemSchema = z.looseObject({
	id: z.string(),
	author: z.string(),
	state: z.string(),
	submitted_at: z.string(),
	body_locator: bodyLocatorSchema,
});

export const threadCommentManifestItemSchema = z.looseObject({
	id: z.number().int(),
	author: z.string(),
	path: z.string(),
	line: z.number().int().nullable(),
	start_line: z.number().int().nullable(),
	created_at: z.string(),
	body_locator: bodyLocatorSchema,
});

export const threadManifestItemSchema = z.looseObject({
	thread_id: z.string(),
	path: z.string(),
	line: z.number().int().nullable(),
	start_line: z.number().int().nullable(),
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comment_count: z.number().int(),
	item_pointer: z.string(),
	comments: z.array(threadCommentManifestItemSchema).default([]),
});

export const discussionCommentManifestItemSchema = z.looseObject({
	comment_id: z.number().int(),
	author: z.string(),
	url: z.string(),
	body_locator: bodyLocatorSchema,
});

export const getFeedbackManifestSchema = z.looseObject({
	payload_reference: payloadReferenceSchema,
	pr_number: z.number().int(),
	reviews: z.array(reviewManifestItemSchema).default([]),
	review_threads: z.array(threadManifestItemSchema).default([]),
	discussion_comments: z.array(discussionCommentManifestItemSchema).default([]),
});

export const prepareRunManifestSchema = z.looseObject({
	payload_reference: payloadReferenceSchema,
	found: z.boolean(),
	number: z.number().int().nullable().default(null),
	reviews: z.array(reviewManifestItemSchema).default([]),
	review_threads: z.array(threadManifestItemSchema).default([]),
	discussion_comments: z.array(discussionCommentManifestItemSchema).default([]),
});

export type PayloadReference = z.infer<typeof payloadReferenceSchema>;
export type FeedbackDomainLocator = z.infer<typeof feedbackDomainLocatorSchema>;
export type BodyLocator = z.infer<typeof bodyLocatorSchema>;
export type ReviewManifestItem = z.infer<typeof reviewManifestItemSchema>;
export type ThreadCommentManifestItem = z.infer<typeof threadCommentManifestItemSchema>;
export type ThreadManifestItem = z.infer<typeof threadManifestItemSchema>;
export type DiscussionCommentManifestItem = z.infer<typeof discussionCommentManifestItemSchema>;
export type GetFeedbackManifest = z.infer<typeof getFeedbackManifestSchema>;
export type PrepareRunManifest = z.infer<typeof prepareRunManifestSchema>;

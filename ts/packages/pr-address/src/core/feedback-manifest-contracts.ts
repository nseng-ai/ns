import { z } from "zod";

import {
	discussionCommentManifestItemSchema as operationDiscussionCommentManifestItemSchema,
	feedbackDomainLocatorSchema as operationFeedbackDomainLocatorSchema,
	getFeedbackPayloadManifestSchema,
	manifestBodyLocatorSchema,
	reviewManifestItemSchema as operationReviewManifestItemSchema,
	threadCommentManifestItemSchema as operationThreadCommentManifestItemSchema,
	threadManifestItemSchema as operationThreadManifestItemSchema,
} from "./operation-schemas/manifest-mirrors.ts";
import { payloadReferenceSchema as operationPayloadReferenceSchema } from "./operation-schemas/shared.ts";

// Tolerant parse-back contracts for persisted payload manifests. The strict
// operation-output mirror in operation-schemas/manifest-mirrors.ts owns the
// canonical field lists; this file only relaxes enum strictness, unknown-key
// handling, and historical defaults for partial manifests read back from disk.
export const payloadReferenceSchema = operationPayloadReferenceSchema.partial().extend({
	payload_path: operationPayloadReferenceSchema.shape.payload_path,
	role: z.string().optional(),
	extension: z.string().optional(),
});

export const feedbackDomainLocatorSchema = operationFeedbackDomainLocatorSchema.loose().extend({
	kind: z.string(),
	review_id: operationFeedbackDomainLocatorSchema.shape.review_id.default(null),
	thread_id: operationFeedbackDomainLocatorSchema.shape.thread_id.default(null),
	comment_id: operationFeedbackDomainLocatorSchema.shape.comment_id.default(null),
	discussion_comment_id: operationFeedbackDomainLocatorSchema.shape.discussion_comment_id.default(null),
	comment_index: operationFeedbackDomainLocatorSchema.shape.comment_index.default(null),
	path: operationFeedbackDomainLocatorSchema.shape.path.default(null),
	line: operationFeedbackDomainLocatorSchema.shape.line.default(null),
	start_line: operationFeedbackDomainLocatorSchema.shape.start_line.default(null),
	is_resolved: operationFeedbackDomainLocatorSchema.shape.is_resolved.default(null),
	is_outdated: operationFeedbackDomainLocatorSchema.shape.is_outdated.default(null),
	author: operationFeedbackDomainLocatorSchema.shape.author.default(null),
});

export const bodyLocatorSchema = manifestBodyLocatorSchema.loose().extend({
	item_pointer: manifestBodyLocatorSchema.shape.item_pointer.default(null),
	domain: feedbackDomainLocatorSchema,
});

export const reviewManifestItemSchema = operationReviewManifestItemSchema.loose().extend({
	state: z.string(),
	body_locator: bodyLocatorSchema,
});

export const threadCommentManifestItemSchema = operationThreadCommentManifestItemSchema.loose().extend({
	body_locator: bodyLocatorSchema,
});

export const threadManifestItemSchema = operationThreadManifestItemSchema.loose().extend({
	comments: z.array(threadCommentManifestItemSchema).default([]),
});

export const discussionCommentManifestItemSchema = operationDiscussionCommentManifestItemSchema.loose().extend({
	body_locator: bodyLocatorSchema,
});

export const getFeedbackManifestSchema = getFeedbackPayloadManifestSchema.omit({ payload_mode: true, counts: true }).loose().extend({
	payload_reference: payloadReferenceSchema,
	reviews: z.array(reviewManifestItemSchema).default([]),
	review_threads: z.array(threadManifestItemSchema).default([]),
	discussion_comments: z.array(discussionCommentManifestItemSchema).default([]),
});

export const prepareRunManifestSchema = getFeedbackManifestSchema.extend({
	found: z.boolean(),
	number: z.number().int().nullable().default(null),
	pr_number: z.number().int().nullable().default(null),
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

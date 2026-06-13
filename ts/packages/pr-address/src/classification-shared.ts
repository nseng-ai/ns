import { z } from "zod";

import { duplicateValues } from "./string-values.ts";
import {
	getFeedbackManifestSchema,
	prepareRunManifestSchema,
	type DiscussionCommentManifestItem,
	type GetFeedbackManifest,
	type PrepareRunManifest,
	type ReviewManifestItem,
	type ThreadManifestItem,
} from "./feedback-manifest-contracts.ts";
import {
	actionComplexitySchema,
	feedbackManifestKindSchema,
	feedbackPlanningValidationErrorSchema,
	informationalReasonSchema,
	type FeedbackManifestKind,
} from "./feedback-plan-contracts.ts";
import { isRecord } from "./operation-support.ts";

const classificationLocatorSchema = z.looseObject({
	json_pointer: z.string(),
	item_pointer: z.string().nullable().default(null),
});

export const classificationDispositionSchema = z.enum(["actionable", "informational"]);

const classifiedReviewSchema = z.looseObject({
	review_id: z.string(),
	disposition: classificationDispositionSchema,
	body_locator: classificationLocatorSchema,
	summary: z.string(),
	action_summary: z.string().nullable().default(null),
	complexity: actionComplexitySchema.nullable().default(null),
	pre_existing: z.boolean().default(false),
	informational_reason: informationalReasonSchema.nullable().default(null),
});

const classifiedThreadCommentSchema = z.looseObject({
	comment_id: z.number().int(),
	body_locator: classificationLocatorSchema,
});

const classifiedThreadSchema = z.looseObject({
	thread_id: z.string(),
	disposition: classificationDispositionSchema,
	thread_item_pointer: z.string(),
	covered_comments: z.array(classifiedThreadCommentSchema).default([]),
	summary: z.string(),
	action_summary: z.string().nullable().default(null),
	complexity: actionComplexitySchema.nullable().default(null),
	pre_existing: z.boolean().default(false),
	informational_reason: informationalReasonSchema.nullable().default(null),
});

const classifiedDiscussionCommentSchema = z.looseObject({
	comment_id: z.number().int(),
	disposition: classificationDispositionSchema,
	body_locator: classificationLocatorSchema,
	summary: z.string(),
	action_summary: z.string().nullable().default(null),
	complexity: actionComplexitySchema.nullable().default(null),
	needs_reply: z.boolean().default(false),
	informational_reason: informationalReasonSchema.nullable().default(null),
});

export const classificationPacketSchema = z.looseObject({
	schema_version: z.literal(1).default(1),
	reviews: z.array(classifiedReviewSchema).default([]),
	review_threads: z.array(classifiedThreadSchema).default([]),
	discussion_comments: z.array(classifiedDiscussionCommentSchema).default([]),
});

export type ClassificationDisposition = z.infer<typeof classificationDispositionSchema>;
export type ManifestKind = FeedbackManifestKind;
export type ValidationItemKind = "review" | "review_thread" | "thread_comment" | "discussion_comment" | "packet";
export type ClassificationBodyLocatorRef = z.infer<typeof classificationLocatorSchema>;
export type ClassifiedReviewItem = z.infer<typeof classifiedReviewSchema>;
type ClassifiedThreadCommentRef = z.infer<typeof classifiedThreadCommentSchema>;
export type ClassifiedThreadItem = z.infer<typeof classifiedThreadSchema>;
export type ClassifiedDiscussionCommentItem = z.infer<typeof classifiedDiscussionCommentSchema>;
export type FeedbackClassificationPacket = z.infer<typeof classificationPacketSchema>;

export interface FeedbackManifestView {
	kind: ManifestKind;
	prNumber: number | null;
	payloadPath: string | null;
	reviews: ReviewManifestItem[];
	requiredThreads: ThreadManifestItem[];
	resolvedThreads: ThreadManifestItem[];
	discussionComments: DiscussionCommentManifestItem[];
}

export type FeedbackClassificationValidationError = z.infer<typeof feedbackPlanningValidationErrorSchema>;

export function buildFeedbackManifestView(manifestPayload: unknown): { view: FeedbackManifestView | null; kind: ManifestKind; errors: FeedbackClassificationValidationError[] } {
	const kind = manifestKindForPayload(manifestPayload);
	const parseResult = kind === "prepare_run" ? prepareRunManifestSchema.safeParse(manifestPayload) : getFeedbackManifestSchema.safeParse(manifestPayload);
	if (!parseResult.success) {
		return { view: null, kind, errors: schemaErrors(parseResult.error, "manifest") };
	}
	const manifest = parseResult.data;
	const requiredThreads: ThreadManifestItem[] = [];
	const resolvedThreads: ThreadManifestItem[] = [];
	for (const thread of manifest.review_threads) {
		if (thread.is_resolved) resolvedThreads.push(thread);
		else requiredThreads.push(thread);
	}
	const prNumber = kind === "prepare_run" ? prepareRunPrNumber(manifest) : getFeedbackPrNumber(manifest);
	const view: FeedbackManifestView = {
		kind,
		prNumber,
		payloadPath: manifest.payload_reference.payload_path,
		reviews: manifest.reviews,
		requiredThreads,
		resolvedThreads,
		discussionComments: manifest.discussion_comments,
	};
	return { view, kind, errors: manifestIntegrityErrors(view) };
}

function prepareRunPrNumber(manifest: PrepareRunManifest | GetFeedbackManifest): number | null {
	if (!("found" in manifest) || manifest.found !== true) return null;
	return typeof manifest.number === "number" ? manifest.number : null;
}

function getFeedbackPrNumber(manifest: PrepareRunManifest | GetFeedbackManifest): number | null {
	return "pr_number" in manifest && typeof manifest.pr_number === "number" ? manifest.pr_number : null;
}

export function manifestKindForPayload(payload: unknown): ManifestKind {
	return isRecord(payload) && "found" in payload ? "prepare_run" : "get_feedback";
}

function manifestIntegrityErrors(view: FeedbackManifestView): FeedbackClassificationValidationError[] {
	const errors: FeedbackClassificationValidationError[] = [];
	errors.push(...manifestDuplicateErrors(view.reviews.map((review) => review.id), "review", "review id"));
	const allThreads = [...view.requiredThreads, ...view.resolvedThreads];
	errors.push(...manifestDuplicateErrors(allThreads.map((thread) => thread.thread_id), "review_thread", "thread id"));
	errors.push(...manifestDuplicateErrors(view.discussionComments.map((comment) => comment.comment_id), "discussion_comment", "discussion comment id"));
	for (const thread of allThreads) {
		errors.push(...manifestDuplicateErrors(thread.comments.map((comment) => comment.id), "thread_comment", `comment id in thread ${thread.thread_id}`));
	}
	return errors;
}

function manifestDuplicateErrors(values: Array<string | number>, kind: ValidationItemKind, identifierName: string): FeedbackClassificationValidationError[] {
	return duplicateValues(values).map((value) => ({
		code: "invalid_schema",
		message: `Manifest has duplicate ${identifierName}: ${value}`,
		kind,
		identifier: value,
		path: null,
	}));
}

export function schemaErrors(error: z.ZodError, subject: "manifest" | "classification"): FeedbackClassificationValidationError[] {
	return error.issues.map((issue, index) => {
		const path = validationErrorPath(subject, issue.path);
		return {
			code: "invalid_schema",
			message: `Invalid ${subject} schema at ${path}: ${issue.message}`,
			kind: "packet",
			identifier: index,
			path,
		};
	});
}

function validationErrorPath(subject: string, loc: readonly PropertyKey[]): string {
	if (loc.length === 0) return subject;
	let path = subject;
	for (const part of loc) {
		if (typeof part === "number") path += `[${part}]`;
		else path += `.${String(part)}`;
	}
	return path;
}

export { duplicateValues } from "./string-values.ts";

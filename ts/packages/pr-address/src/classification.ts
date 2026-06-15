import { z } from "zod";

import { isRecord } from "@asdl/core";
import { duplicateValues } from "./duplicate-values.ts";
import type { classificationTemplateResultDocSchema } from "./operation-schemas/classification.ts";
import {
	getFeedbackManifestSchema,
	prepareRunManifestSchema,
	type BodyLocator,
	type DiscussionCommentManifestItem,
	type GetFeedbackManifest,
	type PrepareRunManifest,
	type ReviewManifestItem,
	type ThreadManifestItem,
} from "./feedback-manifest-contracts.ts";
import {
	ACTION_COMPLEXITIES,
	APPROVAL_REQUIRED_COMPLEXITIES,
	INFORMATIONAL_THREAD_DECISIONS,
	actionComplexitySchema,
	feedbackPlanDiscussionActionItemSchema,
	feedbackPlanDiscussionInformationalItemSchema,
	feedbackPlanResultSchema,
	feedbackPlanReviewActionItemSchema,
	feedbackPlanReviewInformationalItemSchema,
	feedbackPlanThreadActionItemSchema,
	feedbackPlanThreadInformationalItemSchema,
	feedbackPlanningValidationErrorSchema,
	feedbackPlanningValidationResultSchema,
	informationalReasonSchema,
	type ActionComplexity,
	type FeedbackManifestKind,
	type FeedbackPlanActionItem,
	type FeedbackPlanBatch,
	type FeedbackPlanCounts,
	type FeedbackPlanCoveredComment,
	type FeedbackPlanDiscussionActionItem,
	type FeedbackPlanDiscussionInformationalItem,
	type FeedbackPlanInformationalItem,
	type FeedbackPlanResult,
	type FeedbackPlanReviewActionItem,
	type FeedbackPlanReviewInformationalItem,
	type FeedbackPlanThreadActionItem,
	type FeedbackPlanThreadInformationalItem,
	type InformationalReason,
	type PlanSourceKind,
} from "./feedback-plan-contracts.ts";

export const classificationLocatorSchema = z.looseObject({
	json_pointer: z.string(),
	item_pointer: z.string().nullable().default(null),
});

const classificationDispositionSchema = z.enum(["actionable", "informational"]);

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

const classificationPacketSchema = z.looseObject({
	schema_version: z.literal(1).default(1),
	reviews: z.array(classifiedReviewSchema).default([]),
	review_threads: z.array(classifiedThreadSchema).default([]),
	discussion_comments: z.array(classifiedDiscussionCommentSchema).default([]),
});

type ClassificationDisposition = z.infer<typeof classificationDispositionSchema>;
type ManifestKind = FeedbackManifestKind;
type ValidationItemKind = "review" | "review_thread" | "thread_comment" | "discussion_comment" | "packet";
type ClassificationBodyLocatorRef = z.infer<typeof classificationLocatorSchema>;
type ClassifiedReviewItem = z.infer<typeof classifiedReviewSchema>;
type ClassifiedThreadItem = z.infer<typeof classifiedThreadSchema>;
type ClassifiedDiscussionCommentItem = z.infer<typeof classifiedDiscussionCommentSchema>;
type FeedbackClassificationPacket = z.infer<typeof classificationPacketSchema>;

interface FeedbackManifestView {
	kind: ManifestKind;
	prNumber: number | null;
	payloadPath: string | null;
	reviews: ReviewManifestItem[];
	requiredThreads: ThreadManifestItem[];
	resolvedThreads: ThreadManifestItem[];
	discussionComments: DiscussionCommentManifestItem[];
}

export type FeedbackClassificationValidationError = z.infer<typeof feedbackPlanningValidationErrorSchema>;

function buildFeedbackManifestView(manifestPayload: unknown): { view: FeedbackManifestView | null; kind: ManifestKind; errors: FeedbackClassificationValidationError[] } {
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

function manifestKindForPayload(payload: unknown): ManifestKind {
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

function schemaErrors(error: z.ZodError, subject: "manifest" | "classification"): FeedbackClassificationValidationError[] {
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

type ExactOnceCodePrefix = "review" | "thread" | "thread_comment" | "discussion_comment";

export type FeedbackClassificationValidationResult = z.infer<typeof feedbackPlanningValidationResultSchema>;

interface ClassificationValidationArtifacts {
	validation: FeedbackClassificationValidationResult;
	manifestView: FeedbackManifestView | null;
	classificationPacket: FeedbackClassificationPacket | null;
}

export function validateFeedbackClassification(input: { manifest: unknown; classification: unknown }): FeedbackClassificationValidationResult {
	return validateClassificationArtifacts(input).validation;
}

function validateClassificationArtifacts(input: { manifest: unknown; classification: unknown }): ClassificationValidationArtifacts {
	const { view, kind, errors: manifestErrors } = buildFeedbackManifestView(input.manifest);
	const { packet, errors: packetErrors } = classificationPacket(input.classification);
	const counts = validationCounts(view, packet);
	const errors = [...manifestErrors, ...packetErrors];

	if (view !== null && packet !== null && manifestErrors.length === 0) {
		errors.push(...validateReviews(view, packet));
		errors.push(...validateThreads(view, packet));
		errors.push(...validateDiscussionComments(view, packet));
		errors.push(...validateItemSemantics(packet));
	}

	const validation: FeedbackClassificationValidationResult = {
		valid: errors.length === 0,
		manifest_kind: kind,
		pr_number: view?.prNumber ?? null,
		payload_path: view?.payloadPath ?? null,
		counts,
		errors,
	};

	return {
		validation,
		manifestView: view,
		classificationPacket: packet,
	};
}

function classificationPacket(classificationPayload: unknown): { packet: FeedbackClassificationPacket | null; errors: FeedbackClassificationValidationError[] } {
	const parseResult = classificationPacketSchema.safeParse(classificationPayload);
	if (!parseResult.success) return { packet: null, errors: schemaErrors(parseResult.error, "classification") };
	return { packet: parseResult.data, errors: [] };
}

function validationCounts(view: FeedbackManifestView | null, packet: FeedbackClassificationPacket | null): FeedbackClassificationValidationResult["counts"] {
	return {
		reviews_expected: view?.reviews.length ?? 0,
		reviews_classified: packet?.reviews.length ?? 0,
		review_threads_expected: view?.requiredThreads.length ?? 0,
		review_threads_classified: packet?.review_threads.length ?? 0,
		thread_comments_expected: view?.requiredThreads.reduce((total, thread) => total + thread.comments.length, 0) ?? 0,
		thread_comments_covered: packet?.review_threads.reduce((total, thread) => total + thread.covered_comments.length, 0) ?? 0,
		discussion_comments_expected: view?.discussionComments.length ?? 0,
		discussion_comments_classified: packet?.discussion_comments.length ?? 0,
	};
}

function validateReviews(view: FeedbackManifestView, packet: FeedbackClassificationPacket): FeedbackClassificationValidationError[] {
	const manifestById = new Map(view.reviews.map((review) => [review.id, review]));
	const errors = exactOnceErrors({
		expectedIds: view.reviews.map((review) => review.id),
		actualIds: packet.reviews.map((item) => item.review_id),
		codePrefix: "review",
		kind: "review",
		pathPrefix: "classification.reviews",
	});

	packet.reviews.forEach((item, index) => {
		const expected = manifestById.get(item.review_id);
		if (expected === undefined) return;
		errors.push(
			...bodyLocatorErrors({
				actual: item.body_locator,
				expected: expected.body_locator.json_pointer,
				expectedItemPointer: expected.body_locator.item_pointer,
				codeKind: "review",
				identifier: item.review_id,
				pathPrefix: `classification.reviews[${index}].body_locator`,
			}),
		);
	});
	return errors;
}

function validateThreads(view: FeedbackManifestView, packet: FeedbackClassificationPacket): FeedbackClassificationValidationError[] {
	const requiredById = new Map(view.requiredThreads.map((thread) => [thread.thread_id, thread]));
	const resolvedIds = new Set(view.resolvedThreads.map((thread) => thread.thread_id));
	const actualUnresolvedIds = packet.review_threads.filter((item) => !resolvedIds.has(item.thread_id)).map((item) => item.thread_id);
	const errors = exactOnceErrors({
		expectedIds: view.requiredThreads.map((thread) => thread.thread_id),
		actualIds: actualUnresolvedIds,
		codePrefix: "thread",
		kind: "review_thread",
		pathPrefix: "classification.review_threads",
	});

	packet.review_threads.forEach((item, index) => {
		if (resolvedIds.has(item.thread_id)) {
			errors.push({
				code: "resolved_thread_classified",
				message: `Resolved review thread was classified: ${item.thread_id}`,
				kind: "review_thread",
				identifier: item.thread_id,
				path: `classification.review_threads[${index}].thread_id`,
			});
			return;
		}
		const thread = requiredById.get(item.thread_id);
		if (thread === undefined) return;
		if (item.thread_item_pointer !== thread.item_pointer) {
			errors.push({
				code: "invalid_locator",
				message: `Review thread ${item.thread_id} item pointer does not match manifest: expected ${pythonRepr(thread.item_pointer)}, got ${pythonRepr(item.thread_item_pointer)}`,
				kind: "review_thread",
				identifier: item.thread_id,
				path: `classification.review_threads[${index}].thread_item_pointer`,
			});
		}
		errors.push(...validateThreadComments(thread, item, index));
	});
	return errors;
}

function validateThreadComments(thread: ThreadManifestItem, item: ClassifiedThreadItem, itemIndex: number): FeedbackClassificationValidationError[] {
	const manifestById = new Map(thread.comments.map((comment) => [comment.id, comment]));
	const errors = exactOnceErrors({
		expectedIds: thread.comments.map((comment) => comment.id),
		actualIds: item.covered_comments.map((comment) => comment.comment_id),
		codePrefix: "thread_comment",
		kind: "thread_comment",
		pathPrefix: `classification.review_threads[${itemIndex}].covered_comments`,
		parentIdentifier: item.thread_id,
	});
	item.covered_comments.forEach((commentRef, commentIndex) => {
		const expected = manifestById.get(commentRef.comment_id);
		if (expected === undefined) return;
		errors.push(
			...bodyLocatorErrors({
				actual: commentRef.body_locator,
				expected: expected.body_locator.json_pointer,
				expectedItemPointer: expected.body_locator.item_pointer,
				codeKind: "thread_comment",
				identifier: commentRef.comment_id,
				pathPrefix: `classification.review_threads[${itemIndex}].covered_comments[${commentIndex}].body_locator`,
			}),
		);
	});
	return errors;
}

function validateDiscussionComments(view: FeedbackManifestView, packet: FeedbackClassificationPacket): FeedbackClassificationValidationError[] {
	const manifestById = new Map(view.discussionComments.map((comment) => [comment.comment_id, comment]));
	const errors = exactOnceErrors({
		expectedIds: view.discussionComments.map((comment) => comment.comment_id),
		actualIds: packet.discussion_comments.map((item) => item.comment_id),
		codePrefix: "discussion_comment",
		kind: "discussion_comment",
		pathPrefix: "classification.discussion_comments",
	});

	packet.discussion_comments.forEach((item, index) => {
		const expected = manifestById.get(item.comment_id);
		if (expected === undefined) return;
		errors.push(
			...bodyLocatorErrors({
				actual: item.body_locator,
				expected: expected.body_locator.json_pointer,
				expectedItemPointer: expected.body_locator.item_pointer,
				codeKind: "discussion_comment",
				identifier: item.comment_id,
				pathPrefix: `classification.discussion_comments[${index}].body_locator`,
			}),
		);
	});
	return errors;
}

function exactOnceErrors(options: {
	expectedIds: Array<string | number>;
	actualIds: Array<string | number>;
	codePrefix: ExactOnceCodePrefix;
	kind: ValidationItemKind;
	pathPrefix: string;
	parentIdentifier?: string | undefined;
}): FeedbackClassificationValidationError[] {
	const expected = new Set(options.expectedIds);
	const errors: FeedbackClassificationValidationError[] = [];
	for (const duplicateId of duplicateValues(options.actualIds)) {
		errors.push({
			code: `duplicate_${options.codePrefix}`,
			message: exactOnceMessage("duplicate", options.kind, duplicateId, options.parentIdentifier),
			kind: options.kind,
			identifier: duplicateId,
			path: options.pathPrefix,
		});
	}
	for (const actualId of unknownValues(options.actualIds, expected)) {
		errors.push({
			code: `unknown_${options.codePrefix}`,
			message: exactOnceMessage("unknown", options.kind, actualId, options.parentIdentifier),
			kind: options.kind,
			identifier: actualId,
			path: options.pathPrefix,
		});
	}
	const actual = new Set(options.actualIds);
	for (const expectedId of options.expectedIds) {
		if (!actual.has(expectedId)) {
			errors.push({
				code: `missing_${options.codePrefix}`,
				message: exactOnceMessage("missing", options.kind, expectedId, options.parentIdentifier),
				kind: options.kind,
				identifier: expectedId,
				path: options.pathPrefix,
			});
		}
	}
	return errors;
}

function bodyLocatorErrors(options: {
	actual: ClassificationBodyLocatorRef;
	expected: string;
	expectedItemPointer: string | null;
	codeKind: ValidationItemKind;
	identifier: string | number;
	pathPrefix: string;
}): FeedbackClassificationValidationError[] {
	const errors: FeedbackClassificationValidationError[] = [];
	if (options.actual.json_pointer !== options.expected) {
		errors.push({
			code: "invalid_locator",
			message: `${kindLabel(options.codeKind)} ${options.identifier} body JSON Pointer does not match manifest: expected ${pythonRepr(options.expected)}, got ${pythonRepr(options.actual.json_pointer)}`,
			kind: options.codeKind,
			identifier: options.identifier,
			path: `${options.pathPrefix}.json_pointer`,
		});
	}
	if (options.actual.item_pointer !== options.expectedItemPointer) {
		errors.push({
			code: "invalid_locator",
			message: `${kindLabel(options.codeKind)} ${options.identifier} body item pointer does not match manifest: expected ${pythonRepr(options.expectedItemPointer)}, got ${pythonRepr(options.actual.item_pointer)}`,
			kind: options.codeKind,
			identifier: options.identifier,
			path: `${options.pathPrefix}.item_pointer`,
		});
	}
	return errors;
}

function validateItemSemantics(packet: FeedbackClassificationPacket): FeedbackClassificationValidationError[] {
	const errors: FeedbackClassificationValidationError[] = [];
	packet.reviews.forEach((item, index) => {
		errors.push(
			...itemSemanticErrors({
				disposition: item.disposition,
				summary: item.summary,
				actionSummary: item.action_summary,
				complexity: item.complexity,
				preExisting: item.pre_existing,
				informationalReason: item.informational_reason,
				kind: "review",
				identifier: item.review_id,
				pathPrefix: `classification.reviews[${index}]`,
			}),
		);
	});
	packet.review_threads.forEach((item, index) => {
		errors.push(
			...itemSemanticErrors({
				disposition: item.disposition,
				summary: item.summary,
				actionSummary: item.action_summary,
				complexity: item.complexity,
				preExisting: item.pre_existing,
				informationalReason: item.informational_reason,
				kind: "review_thread",
				identifier: item.thread_id,
				pathPrefix: `classification.review_threads[${index}]`,
			}),
		);
	});
	packet.discussion_comments.forEach((item, index) => {
		errors.push(
			...itemSemanticErrors({
				disposition: item.disposition,
				summary: item.summary,
				actionSummary: item.action_summary,
				complexity: item.complexity,
				preExisting: false,
				informationalReason: item.informational_reason,
				kind: "discussion_comment",
				identifier: item.comment_id,
				pathPrefix: `classification.discussion_comments[${index}]`,
				needsReply: item.needs_reply,
			}),
		);
	});
	return errors;
}

function itemSemanticErrors(options: {
	disposition: ClassificationDisposition;
	summary: string;
	actionSummary: string | null;
	complexity: ActionComplexity | null;
	preExisting: boolean;
	informationalReason: InformationalReason | null;
	kind: ValidationItemKind;
	identifier: string | number;
	pathPrefix: string;
	needsReply?: boolean | undefined;
}): FeedbackClassificationValidationError[] {
	const errors: FeedbackClassificationValidationError[] = [];
	if (options.summary.trim() === "") {
		errors.push({
			code: "invalid_schema",
			message: `${kindLabel(options.kind)} ${options.identifier} summary must be non-empty.`,
			kind: options.kind,
			identifier: options.identifier,
			path: `${options.pathPrefix}.summary`,
		});
	}
	if (options.disposition === "actionable") {
		if (options.actionSummary === null || options.actionSummary.trim() === "") {
			errors.push({
				code: "invalid_action_fields",
				message: `Actionable ${kindLabel(options.kind)} ${options.identifier} requires action_summary.`,
				kind: options.kind,
				identifier: options.identifier,
				path: `${options.pathPrefix}.action_summary`,
			});
		}
		if (options.complexity === null) {
			errors.push({
				code: "invalid_action_fields",
				message: `Actionable ${kindLabel(options.kind)} ${options.identifier} requires complexity.`,
				kind: options.kind,
				identifier: options.identifier,
				path: `${options.pathPrefix}.complexity`,
			});
		}
		if (options.informationalReason !== null) {
			errors.push({
				code: "invalid_action_fields",
				message: `Actionable ${kindLabel(options.kind)} ${options.identifier} must not include informational_reason.`,
				kind: options.kind,
				identifier: options.identifier,
				path: `${options.pathPrefix}.informational_reason`,
			});
		}
		if (options.preExisting && options.complexity !== "pre_existing") {
			errors.push({
				code: "invalid_action_fields",
				message: `Actionable ${kindLabel(options.kind)} ${options.identifier} with pre_existing=true must use complexity='pre_existing'.`,
				kind: options.kind,
				identifier: options.identifier,
				path: `${options.pathPrefix}.pre_existing`,
			});
		}
		if (options.complexity === "pre_existing" && !options.preExisting) {
			errors.push({
				code: "invalid_action_fields",
				message: `Actionable ${kindLabel(options.kind)} ${options.identifier} with complexity='pre_existing' must set pre_existing=true.`,
				kind: options.kind,
				identifier: options.identifier,
				path: `${options.pathPrefix}.complexity`,
			});
		}
		return errors;
	}

	if (options.informationalReason === null) {
		errors.push({
			code: "invalid_informational_fields",
			message: `Informational ${kindLabel(options.kind)} ${options.identifier} requires informational_reason.`,
			kind: options.kind,
			identifier: options.identifier,
			path: `${options.pathPrefix}.informational_reason`,
		});
	}
	if (options.actionSummary !== null && options.actionSummary.trim() !== "") {
		errors.push({
			code: "invalid_informational_fields",
			message: `Informational ${kindLabel(options.kind)} ${options.identifier} must not include action_summary.`,
			kind: options.kind,
			identifier: options.identifier,
			path: `${options.pathPrefix}.action_summary`,
		});
	}
	if (options.complexity !== null) {
		errors.push({
			code: "invalid_informational_fields",
			message: `Informational ${kindLabel(options.kind)} ${options.identifier} must not include complexity.`,
			kind: options.kind,
			identifier: options.identifier,
			path: `${options.pathPrefix}.complexity`,
		});
	}
	if (options.preExisting) {
		errors.push({
			code: "invalid_informational_fields",
			message: `Informational ${kindLabel(options.kind)} ${options.identifier} must not be pre_existing.`,
			kind: options.kind,
			identifier: options.identifier,
			path: `${options.pathPrefix}.pre_existing`,
		});
	}
	if (options.needsReply === true) {
		errors.push({
			code: "invalid_informational_fields",
			message: `Informational ${kindLabel(options.kind)} ${options.identifier} must not set needs_reply.`,
			kind: options.kind,
			identifier: options.identifier,
			path: `${options.pathPrefix}.needs_reply`,
		});
	}
	return errors;
}

function unknownValues(values: Array<string | number>, expected: Set<string | number>): Array<string | number> {
	const seen = new Set<string | number>();
	const unknowns: Array<string | number> = [];
	for (const value of values) {
		if (!expected.has(value) && !seen.has(value)) {
			unknowns.push(value);
			seen.add(value);
		}
	}
	return unknowns;
}

type ExactOnceVerb = "duplicate" | "unknown" | "missing";

const EXACT_ONCE_MESSAGE_TEMPLATES: Record<
	ExactOnceVerb,
	{
		threadComment: (identifier: string | number, parentIdentifier: string) => string;
		fallback: (label: string, identifier: string | number) => string;
	}
> = {
	duplicate: {
		threadComment: (identifier, parentIdentifier) => `Thread comment ${identifier} is covered more than once in thread ${parentIdentifier}.`,
		fallback: (label, identifier) => `${label} ${identifier} is classified more than once.`,
	},
	unknown: {
		threadComment: (identifier, parentIdentifier) => `Thread comment ${identifier} is not present in thread ${parentIdentifier}.`,
		fallback: (label, identifier) => `${label} ${identifier} is not present in the manifest.`,
	},
	missing: {
		threadComment: (identifier, parentIdentifier) => `Thread comment ${identifier} is missing from thread ${parentIdentifier} coverage.`,
		fallback: (label, identifier) => `${label} ${identifier} is missing from the classification packet.`,
	},
};

function exactOnceMessage(verb: ExactOnceVerb, kind: ValidationItemKind, identifier: string | number, parentIdentifier: string | undefined): string {
	const templates = EXACT_ONCE_MESSAGE_TEMPLATES[verb];
	if (kind === "thread_comment" && parentIdentifier !== undefined) return templates.threadComment(identifier, parentIdentifier);
	return templates.fallback(kindLabel(kind), identifier);
}

function kindLabel(kind: ValidationItemKind): string {
	return kind.replaceAll("_", " ");
}

type FeedbackPlanItem = FeedbackPlanActionItem | FeedbackPlanInformationalItem;

interface PlanSourceItemFields {
	review_id?: string | null;
	review_state?: string | null;
	submitted_at?: string | null;
	thread_id?: string | null;
	discussion_comment_id?: number | null;
	covered_comment_ids?: number[];
	covered_comments?: FeedbackPlanCoveredComment[];
	body_locator?: BodyLocator | null;
	thread_item_pointer?: string | null;
	path?: string | null;
	line?: number | null;
	start_line?: number | null;
	is_outdated?: boolean | null;
	author?: string | null;
	url?: string | null;
}

export type FeedbackPlanningResult = FeedbackPlanResult;

interface ClassifiedLookup {
	reviews: Map<string, ClassifiedReviewItem>;
	threads: Map<string, ClassifiedThreadItem>;
	comments: Map<number, ClassifiedDiscussionCommentItem>;
}

export function planFeedback(input: { manifest: unknown; classification: unknown }): FeedbackPlanningResult {
	const artifacts = validateClassificationArtifacts(input);
	const validation = artifacts.validation;
	if (!validation.valid) {
		return {
			valid: false,
			manifest_kind: validation.manifest_kind,
			pr_number: validation.pr_number,
			payload_path: validation.payload_path,
			validation,
			counts: null,
			batches: [],
			informational: [],
			warnings: [],
		};
	}

	if (artifacts.manifestView === null || artifacts.classificationPacket === null) {
		throw new Error("Validated feedback classification has null manifest view or packet; this is a programmer error.");
	}

	const view = artifacts.manifestView;
	const lookup = classifiedLookup(artifacts.classificationPacket);
	const { actions, informational } = partitionPlanItems(view, lookup);
	const batches = batchesForActions(actions);
	return feedbackPlanResultSchema.parse({
		valid: true,
		manifest_kind: view.kind,
		pr_number: view.prNumber,
		payload_path: view.payloadPath,
		validation,
		counts: planCounts(actions, informational, batches),
		batches,
		informational,
		warnings: planningWarnings(view),
	});
}

function classifiedLookup(packet: FeedbackClassificationPacket): ClassifiedLookup {
	return {
		reviews: new Map(packet.reviews.map((item) => [item.review_id, item])),
		threads: new Map(packet.review_threads.map((item) => [item.thread_id, item])),
		comments: new Map(packet.discussion_comments.map((item) => [item.comment_id, item])),
	};
}

interface PlanPartition {
	actions: FeedbackPlanActionItem[];
	informational: FeedbackPlanInformationalItem[];
}

function partitionPlanItems(view: FeedbackManifestView, classified: ClassifiedLookup): PlanPartition {
	const actions: FeedbackPlanActionItem[] = [];
	const informational: FeedbackPlanInformationalItem[] = [];
	for (const review of view.reviews) {
		const item = classified.reviews.get(review.id);
		if (item?.disposition === "actionable") actions.push(reviewActionItem(review, item));
		else if (item?.disposition === "informational") informational.push(reviewInformationalItem(review, item));
	}
	for (const thread of view.requiredThreads) {
		const item = classified.threads.get(thread.thread_id);
		if (item?.disposition === "actionable") actions.push(threadActionItem(thread, item));
		else if (item?.disposition === "informational") informational.push(threadInformationalItem(thread, item));
	}
	for (const comment of view.discussionComments) {
		const item = classified.comments.get(comment.comment_id);
		if (item?.disposition === "actionable") actions.push(discussionActionItem(comment, item));
		else if (item?.disposition === "informational") informational.push(discussionInformationalItem(comment, item));
	}
	return { actions, informational };
}

function reviewSourceFields(review: ReviewManifestItem): PlanSourceItemFields {
	return {
		review_id: review.id,
		review_state: review.state,
		submitted_at: review.submitted_at,
		body_locator: review.body_locator,
		author: review.author,
	};
}

function threadSourceFields(thread: ThreadManifestItem, item: ClassifiedThreadItem): PlanSourceItemFields {
	const coveredComments = coveredThreadComments(thread, item);
	const firstComment = coveredComments[0] ?? null;
	return {
		thread_id: thread.thread_id,
		covered_comment_ids: coveredComments.map((comment) => comment.comment_id),
		covered_comments: coveredComments,
		body_locator: firstComment?.body_locator ?? null,
		thread_item_pointer: thread.item_pointer,
		path: thread.path,
		line: thread.line,
		start_line: thread.start_line,
		is_outdated: thread.is_outdated,
		author: firstComment?.author ?? null,
	};
}

function discussionSourceFields(comment: DiscussionCommentManifestItem): PlanSourceItemFields {
	return {
		discussion_comment_id: comment.comment_id,
		body_locator: comment.body_locator,
		author: comment.author,
		url: comment.url,
	};
}

function reviewActionItem(review: ReviewManifestItem, item: ClassifiedReviewItem): FeedbackPlanReviewActionItem {
	return feedbackPlanReviewActionItemSchema.parse({
		...planSourceItemBase("review", item.summary, reviewSourceFields(review)),
		source_kind: "review",
		action_summary: item.action_summary,
		complexity: requiredActionComplexity(item.complexity),
		pre_existing: item.pre_existing,
		needs_reply: null,
	});
}

function threadActionItem(thread: ThreadManifestItem, item: ClassifiedThreadItem): FeedbackPlanThreadActionItem {
	return feedbackPlanThreadActionItemSchema.parse({
		...planSourceItemBase("review_thread", item.summary, threadSourceFields(thread, item)),
		source_kind: "review_thread",
		action_summary: item.action_summary,
		complexity: requiredActionComplexity(item.complexity),
		pre_existing: item.pre_existing,
		needs_reply: null,
	});
}

function discussionActionItem(comment: DiscussionCommentManifestItem, item: ClassifiedDiscussionCommentItem): FeedbackPlanDiscussionActionItem {
	return feedbackPlanDiscussionActionItemSchema.parse({
		...planSourceItemBase("discussion_comment", item.summary, discussionSourceFields(comment)),
		source_kind: "discussion_comment",
		action_summary: item.action_summary,
		complexity: requiredActionComplexity(item.complexity),
		pre_existing: false,
		needs_reply: item.needs_reply,
	});
}

function reviewInformationalItem(review: ReviewManifestItem, item: ClassifiedReviewItem): FeedbackPlanReviewInformationalItem {
	return feedbackPlanReviewInformationalItemSchema.parse({
		...planSourceItemBase("review", item.summary, reviewSourceFields(review)),
		source_kind: "review",
		informational_reason: item.informational_reason,
		user_decision_required: false,
		allowed_decisions: [],
	});
}

function threadInformationalItem(thread: ThreadManifestItem, item: ClassifiedThreadItem): FeedbackPlanThreadInformationalItem {
	return feedbackPlanThreadInformationalItemSchema.parse({
		...planSourceItemBase("review_thread", item.summary, threadSourceFields(thread, item)),
		source_kind: "review_thread",
		informational_reason: item.informational_reason,
		user_decision_required: true,
		allowed_decisions: [...INFORMATIONAL_THREAD_DECISIONS],
	});
}

function discussionInformationalItem(comment: DiscussionCommentManifestItem, item: ClassifiedDiscussionCommentItem): FeedbackPlanDiscussionInformationalItem {
	return feedbackPlanDiscussionInformationalItemSchema.parse({
		...planSourceItemBase("discussion_comment", item.summary, discussionSourceFields(comment)),
		source_kind: "discussion_comment",
		informational_reason: item.informational_reason,
		user_decision_required: false,
		allowed_decisions: [],
	});
}

function planSourceItemBase(sourceKind: PlanSourceKind, summary: string, fields: PlanSourceItemFields): { source_kind: PlanSourceKind; summary: string } & Required<PlanSourceItemFields> {
	return {
		source_kind: sourceKind,
		summary,
		review_id: fields.review_id ?? null,
		review_state: fields.review_state ?? null,
		submitted_at: fields.submitted_at ?? null,
		thread_id: fields.thread_id ?? null,
		discussion_comment_id: fields.discussion_comment_id ?? null,
		covered_comment_ids: fields.covered_comment_ids ?? [],
		covered_comments: fields.covered_comments ?? [],
		body_locator: fields.body_locator ?? null,
		thread_item_pointer: fields.thread_item_pointer ?? null,
		path: fields.path ?? null,
		line: fields.line ?? null,
		start_line: fields.start_line ?? null,
		is_outdated: fields.is_outdated ?? null,
		author: fields.author ?? null,
		url: fields.url ?? null,
	};
}

function coveredThreadComments(thread: ThreadManifestItem, item: ClassifiedThreadItem): FeedbackPlanCoveredComment[] {
	const coveredIds = new Set(item.covered_comments.map((comment) => comment.comment_id));
	return thread.comments.filter((comment) => coveredIds.has(comment.id)).map((comment) => ({
		comment_id: comment.id,
		author: comment.author,
		path: comment.path,
		line: comment.line,
		start_line: comment.start_line,
		body_locator: comment.body_locator,
	}));
}

function batchesForActions(actions: FeedbackPlanActionItem[]): FeedbackPlanBatch[] {
	const byComplexity = new Map<ActionComplexity, FeedbackPlanActionItem[]>(ACTION_COMPLEXITIES.map((complexity) => [complexity, []]));
	for (const item of actions) byComplexity.get(item.complexity)?.push(item);
	const batches: FeedbackPlanBatch[] = [];
	for (const complexity of ACTION_COMPLEXITIES) {
		const items = byComplexity.get(complexity) ?? [];
		if (items.length > 0) {
			batches.push({
				batch_id: complexity,
				complexity,
				approval_required: APPROVAL_REQUIRED_COMPLEXITIES.has(complexity),
				items,
			});
		}
	}
	return batches;
}

function requiredActionComplexity(complexity: ActionComplexity | null): ActionComplexity {
	if (complexity !== null) return complexity;
	throw new Error("Validated actionable feedback item is missing complexity.");
}

function planCounts(actions: FeedbackPlanActionItem[], informational: FeedbackPlanInformationalItem[], batches: FeedbackPlanBatch[]): FeedbackPlanCounts {
	const actionCounts = sourceKindCounts(actions);
	const informationalCounts = sourceKindCounts(informational);
	return {
		actionable_items: actions.length,
		informational_items: informational.length,
		batches: batches.length,
		approval_required_batches: batches.filter((batch) => batch.approval_required).length,
		actionable_reviews: actionCounts.review,
		actionable_review_threads: actionCounts.review_thread,
		actionable_discussion_comments: actionCounts.discussion_comment,
		informational_reviews: informationalCounts.review,
		informational_review_threads: informationalCounts.review_thread,
		informational_discussion_comments: informationalCounts.discussion_comment,
	};
}

function sourceKindCounts(items: readonly FeedbackPlanItem[]): Record<PlanSourceKind, number> {
	const counts: Record<PlanSourceKind, number> = { review: 0, review_thread: 0, discussion_comment: 0 };
	for (const item of items) counts[item.source_kind] += 1;
	return counts;
}

function planningWarnings(view: FeedbackManifestView): string[] {
	if (view.kind === "prepare_run" && view.prNumber === null && view.reviews.length === 0 && view.requiredThreads.length === 0 && view.discussionComments.length === 0) {
		return ["prepare-run manifest has found=false; plan is empty."];
	}
	return [];
}

type ClassificationTemplateResult = z.infer<typeof classificationTemplateResultDocSchema>;

const FILL_DISPOSITION_PLACEHOLDER = "<fill: actionable|informational>";

export function buildFeedbackClassificationTemplate(manifest: unknown): { type: "ok"; value: ClassificationTemplateResult } | { type: "error"; message: string } {
	const viewResult = buildFeedbackManifestView(manifest);
	if (viewResult.view === null || viewResult.errors.length > 0) {
		const firstError = viewResult.errors[0];
		const suffix = firstError === undefined ? "" : ` ${firstError.message}`;
		return { type: "error", message: `Cannot build feedback classification template from invalid manifest.${suffix}` };
	}

	const view = viewResult.view;
	return {
		type: "ok",
		value: {
			manifest_kind: view.kind,
			pr_number: view.prNumber,
			payload_path: view.payloadPath,
			counts: {
				reviews: view.reviews.length,
				review_threads: view.requiredThreads.length,
				thread_comments: view.requiredThreads.reduce((total, thread) => total + thread.comments.length, 0),
				discussion_comments: view.discussionComments.length,
				resolved_review_threads_omitted: view.resolvedThreads.length,
			},
			classification_template: {
				schema_version: 1,
				reviews: view.reviews.map((review) => ({
					review_id: review.id,
					disposition: FILL_DISPOSITION_PLACEHOLDER,
					body_locator: classificationLocatorRef(review.body_locator),
					summary: "",
					action_summary: null,
					complexity: null,
					pre_existing: false,
					informational_reason: null,
				})),
				review_threads: view.requiredThreads.map((thread) => ({
					thread_id: thread.thread_id,
					disposition: FILL_DISPOSITION_PLACEHOLDER,
					thread_item_pointer: thread.item_pointer,
					covered_comments: thread.comments.map((comment) => ({
						comment_id: comment.id,
						body_locator: classificationLocatorRef(comment.body_locator),
					})),
					summary: "",
					action_summary: null,
					complexity: null,
					pre_existing: false,
					informational_reason: null,
				})),
				discussion_comments: view.discussionComments.map((comment) => ({
					comment_id: comment.comment_id,
					disposition: FILL_DISPOSITION_PLACEHOLDER,
					body_locator: classificationLocatorRef(comment.body_locator),
					summary: "",
					action_summary: null,
					complexity: null,
					needs_reply: false,
					informational_reason: null,
				})),
			},
		},
	};
}

function classificationLocatorRef(locator: BodyLocator): { json_pointer: string; item_pointer: string | null } {
	return {
		json_pointer: locator.json_pointer,
		item_pointer: locator.item_pointer,
	};
}

function pythonRepr(value: string | null): string {
	if (value === null) return "None";
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

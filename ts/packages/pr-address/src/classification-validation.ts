import {
	buildFeedbackManifestView,
	classificationPacketSchema,
	duplicateValues,
	manifestKindForPayload,
	schemaErrors,
	type ClassificationBodyLocatorRef,
	type ClassificationDisposition,
	type ClassifiedThreadItem,
	type FeedbackClassificationPacket,
	type FeedbackClassificationValidationError,
	type FeedbackManifestView,
	type ManifestKind,
	type ValidationItemKind,
} from "./classification-shared.ts";
import { type ThreadManifestItem } from "./feedback-manifest-contracts.ts";
import { pythonReprOrNull as pythonRepr } from "./string-values.ts";
import { type ActionComplexity, type InformationalReason } from "./feedback-plan-contracts.ts";

type ExactOnceCodePrefix = "review" | "thread" | "thread_comment" | "discussion_comment";

export interface FeedbackClassificationValidationResult {
	valid: boolean;
	manifest_kind: ManifestKind;
	pr_number: number | null;
	payload_path: string | null;
	counts: {
		reviews_expected: number;
		reviews_classified: number;
		review_threads_expected: number;
		review_threads_classified: number;
		thread_comments_expected: number;
		thread_comments_covered: number;
		discussion_comments_expected: number;
		discussion_comments_classified: number;
	};
	errors: FeedbackClassificationValidationError[];
}

interface FeedbackClassificationValidationArtifacts {
	validation: FeedbackClassificationValidationResult;
	manifestView: FeedbackManifestView | null;
	classificationPacket: FeedbackClassificationPacket | null;
}

export function validateFeedbackClassification(input: { manifest: unknown; classification: unknown }): FeedbackClassificationValidationResult {
	return validateFeedbackClassificationArtifacts(input).validation;
}

export function validateFeedbackClassificationArtifacts(input: { manifest: unknown; classification: unknown }): FeedbackClassificationValidationArtifacts {
	const manifestKind = manifestKindForPayload(input.manifest);
	const { view, errors: manifestErrors } = buildFeedbackManifestView(input.manifest);
	const { packet, errors: packetErrors } = classificationPacket(input.classification);
	const counts = validationCounts(view, packet);
	const errors = [...manifestErrors, ...packetErrors];

	if (view !== null && packet !== null && manifestErrors.length === 0) {
		errors.push(...validateReviews(view, packet));
		errors.push(...validateThreads(view, packet));
		errors.push(...validateDiscussionComments(view, packet));
		errors.push(...validateItemSemantics(packet));
	}

	return {
		validation: {
			valid: errors.length === 0,
			manifest_kind: view?.kind ?? manifestKind,
			pr_number: view?.prNumber ?? null,
			payload_path: view?.payloadPath ?? null,
			counts,
			errors,
		},
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


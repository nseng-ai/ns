import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";

import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
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
	INFORMATIONAL_THREAD_DECISIONS,
	actionComplexitySchema,
	feedbackPlanDiscussionActionItemSchema,
	feedbackPlanDiscussionInformationalItemSchema,
	feedbackPlanResultSchema,
	feedbackPlanReviewActionItemSchema,
	feedbackPlanReviewInformationalItemSchema,
	feedbackPlanThreadActionItemSchema,
	feedbackPlanThreadInformationalItemSchema,
	informationalReasonSchema,
	type ActionComplexity,
	type FeedbackPlanActionItem,
	type FeedbackPlanBatch,
	type FeedbackPlanCounts,
	type FeedbackPlanCoveredComment,
	type FeedbackPlanDiscussionActionItem,
	type FeedbackPlanDiscussionInformationalItem,
	type FeedbackPlanInformationalItem,
	type FeedbackPlanReviewActionItem,
	type FeedbackPlanReviewInformationalItem,
	type FeedbackPlanThreadActionItem,
	type FeedbackPlanThreadInformationalItem,
	type InformationalReason,
	type PlanSourceKind,
} from "./feedback-plan-contracts.ts";
import { loadJsonInput, readJsonInputText } from "./json-input.ts";

const FILL_DISPOSITION_PLACEHOLDER = "<fill: actionable|informational>";
const APPROVAL_REQUIRED_COMPLEXITIES = new Set<ActionComplexity>(["cross_cutting", "complex"]);

const classificationLocatorSchema = z.looseObject({
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

const wrapperPayloadSchema = z.looseObject({
	manifest: z.unknown(),
	classification: z.unknown(),
});

type ClassificationDisposition = "actionable" | "informational";
type ManifestKind = "get_feedback" | "prepare_run";
type ValidationItemKind = "review" | "review_thread" | "thread_comment" | "discussion_comment" | "packet";
type ExactOnceCodePrefix = "review" | "thread" | "thread_comment" | "discussion_comment";
type ClassificationBodyLocatorRef = z.infer<typeof classificationLocatorSchema>;
type ClassifiedReviewItem = z.infer<typeof classifiedReviewSchema>;
type ClassifiedThreadCommentRef = z.infer<typeof classifiedThreadCommentSchema>;
type ClassifiedThreadItem = z.infer<typeof classifiedThreadSchema>;
type ClassifiedDiscussionCommentItem = z.infer<typeof classifiedDiscussionCommentSchema>;
type FeedbackClassificationPacket = z.infer<typeof classificationPacketSchema>;
type WrapperPayload = z.infer<typeof wrapperPayloadSchema>;

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

interface FeedbackManifestView {
	kind: ManifestKind;
	prNumber: number | null;
	payloadPath: string | null;
	reviews: ReviewManifestItem[];
	requiredThreads: ThreadManifestItem[];
	resolvedThreads: ThreadManifestItem[];
	discussionComments: DiscussionCommentManifestItem[];
}

export interface FeedbackClassificationValidationError {
	code: string;
	message: string;
	kind: ValidationItemKind;
	identifier: string | number | null;
	path: string | null;
}

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

export interface FeedbackPlanningResult {
	valid: boolean;
	manifest_kind: ManifestKind;
	pr_number: number | null;
	payload_path: string | null;
	validation: FeedbackClassificationValidationResult;
	counts: FeedbackPlanCounts | null;
	batches: FeedbackPlanBatch[];
	informational: FeedbackPlanInformationalItem[];
	warnings: string[];
}

interface ClassifiedLookup {
	reviews: Map<string, ClassifiedReviewItem>;
	threads: Map<string, ClassifiedThreadItem>;
	comments: Map<number, ClassifiedDiscussionCommentItem>;
}

const classificationTemplateParseSchema = z.object({
	manifest_json: z.string().optional(),
	manifest_file: z.string().optional(),
});

export const classificationTemplateOperation = defineExecOperation({
	spec: {
		name: "classification-template",
		description: "Build a deterministic classification scaffold from a compact payload manifest.",
		schema: classificationTemplateParseSchema,
		handler: runClassificationTemplateOperation,
	},
});

const validateFeedbackClassificationParseSchema = z.object({
	payload_json: z.string().optional(),
	payload_file: z.string().optional(),
	manifest_json: z.string().optional(),
	manifest_file: z.string().optional(),
	classification_json: z.string().optional(),
	classification_file: z.string().optional(),
});

export const validateFeedbackClassificationOperation = defineExecOperation({
	spec: {
		name: "validate-feedback-classification",
		description: "Validate a PR feedback classification packet against a compact payload manifest.",
		schema: validateFeedbackClassificationParseSchema,
		handler: runValidateFeedbackClassificationOperation,
	},
});

const planFeedbackParseSchema = z.object({
	payload_json: z.string().optional(),
	payload_file: z.string().optional(),
});

export const planFeedbackOperation = defineExecOperation({
	spec: {
		name: "plan-feedback",
		description: "Plan deterministic PR feedback execution batches from a validated classification packet.",
		schema: planFeedbackParseSchema,
		handler: runPlanFeedbackOperation,
	},
});

async function runClassificationTemplateOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof classificationTemplateParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const manifestResult = await loadJsonObjectSource({
		inlineJson: request.manifest_json,
		filePath: request.manifest_file,
		canReadStdin: true,
		commandName: "classification-template",
		inputName: "compact manifest",
		inlineOption: "--manifest-json",
		fileOption: "--manifest-file",
		stdin: ctx.stdin,
	});
	if (manifestResult.type === "error") return failure(manifestResult.errorType, manifestResult.message);

	const result = buildFeedbackClassificationTemplate(manifestResult.value);
	if (result.type === "error") return failure("invalid_request", result.message);
	return ok(result.value);
}

async function runValidateFeedbackClassificationOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const payloadResult = await loadValidatePayload(request, ctx.stdin);
	if (payloadResult.type === "error") return failure(payloadResult.errorType, payloadResult.message);

	const result = validateFeedbackClassification({ manifest: payloadResult.value.manifest, classification: payloadResult.value.classification });
	if (result.valid) return ok(result);
	return negative("PR feedback classification failed validation.", result);
}

async function runPlanFeedbackOperation(ctx: PrAddressExecContext, request: z.output<typeof planFeedbackParseSchema>): Promise<ClinkrExit<unknown>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.payload_json,
		filePath: request.payload_file,
		commandName: "plan-feedback",
		inputDescription: "JSON payload",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		schema: wrapperPayloadSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);

	const result = planFeedback({ manifest: payloadResult.value.manifest, classification: payloadResult.value.classification });
	if (result.valid) return ok(result);
	return negative("PR feedback classification failed validation; no plan produced.", result);
}

export function buildFeedbackClassificationTemplate(manifest: unknown): { type: "ok"; value: unknown } | { type: "error"; message: string } {
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

export function planFeedback(input: { manifest: unknown; classification: unknown }): FeedbackPlanningResult {
	const artifacts = validateFeedbackClassificationArtifacts(input);
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
		return {
			valid: false,
			manifest_kind: validation.manifest_kind,
			pr_number: validation.pr_number,
			payload_path: validation.payload_path,
			validation,
			counts: null,
			batches: [],
			informational: [],
			warnings: ["Validated input could not be converted into planning artifacts."],
		};
	}

	const view = artifacts.manifestView;
	const lookup = classifiedLookup(artifacts.classificationPacket);
	const actions = actionItems(view, lookup);
	const informational = informationalItems(view, lookup);
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

function buildFeedbackManifestView(manifestPayload: unknown): { view: FeedbackManifestView | null; errors: FeedbackClassificationValidationError[] } {
	const kind = manifestKindForPayload(manifestPayload);
	const parseResult = kind === "prepare_run" ? prepareRunManifestSchema.safeParse(manifestPayload) : getFeedbackManifestSchema.safeParse(manifestPayload);
	if (!parseResult.success) {
		return { view: null, errors: schemaErrors(parseResult.error, "manifest") };
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
	return { view, errors: manifestIntegrityErrors(view) };
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

function classificationPacket(classificationPayload: unknown): { packet: FeedbackClassificationPacket | null; errors: FeedbackClassificationValidationError[] } {
	const parseResult = classificationPacketSchema.safeParse(classificationPayload);
	if (!parseResult.success) return { packet: null, errors: schemaErrors(parseResult.error, "classification") };
	return { packet: parseResult.data, errors: [] };
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
			code: duplicateCode(options.codePrefix),
			message: duplicateMessage(options.kind, duplicateId, options.parentIdentifier),
			kind: options.kind,
			identifier: duplicateId,
			path: options.pathPrefix,
		});
	}
	for (const actualId of unknownValues(options.actualIds, expected)) {
		errors.push({
			code: unknownCode(options.codePrefix),
			message: unknownMessage(options.kind, actualId, options.parentIdentifier),
			kind: options.kind,
			identifier: actualId,
			path: options.pathPrefix,
		});
	}
	const actual = new Set(options.actualIds);
	for (const expectedId of options.expectedIds) {
		if (!actual.has(expectedId)) {
			errors.push({
				code: missingCode(options.codePrefix),
				message: missingMessage(options.kind, expectedId, options.parentIdentifier),
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

function classifiedLookup(packet: FeedbackClassificationPacket): ClassifiedLookup {
	return {
		reviews: new Map(packet.reviews.map((item) => [item.review_id, item])),
		threads: new Map(packet.review_threads.map((item) => [item.thread_id, item])),
		comments: new Map(packet.discussion_comments.map((item) => [item.comment_id, item])),
	};
}

function actionItems(view: FeedbackManifestView, classified: ClassifiedLookup): FeedbackPlanActionItem[] {
	const actions: FeedbackPlanActionItem[] = [];
	for (const review of view.reviews) {
		const item = classified.reviews.get(review.id);
		if (item?.disposition === "actionable") actions.push(reviewActionItem(review, item));
	}
	for (const thread of view.requiredThreads) {
		const item = classified.threads.get(thread.thread_id);
		if (item?.disposition === "actionable") actions.push(threadActionItem(thread, item));
	}
	for (const comment of view.discussionComments) {
		const item = classified.comments.get(comment.comment_id);
		if (item?.disposition === "actionable") actions.push(discussionActionItem(comment, item));
	}
	return actions;
}

function reviewActionItem(review: ReviewManifestItem, item: ClassifiedReviewItem): FeedbackPlanReviewActionItem {
	return feedbackPlanReviewActionItemSchema.parse({
		...planSourceItemBase("review", item.summary, {
			review_id: review.id,
			review_state: review.state,
			submitted_at: review.submitted_at,
			body_locator: review.body_locator,
			author: review.author,
		}),
		action_summary: item.action_summary,
		complexity: requiredActionComplexity(item.complexity),
		pre_existing: item.pre_existing,
		needs_reply: null,
	});
}

function threadActionItem(thread: ThreadManifestItem, item: ClassifiedThreadItem): FeedbackPlanThreadActionItem {
	const coveredComments = coveredThreadComments(thread, item);
	const firstComment = coveredComments[0] ?? null;
	return feedbackPlanThreadActionItemSchema.parse({
		...planSourceItemBase("review_thread", item.summary, {
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
		}),
		action_summary: item.action_summary,
		complexity: requiredActionComplexity(item.complexity),
		pre_existing: item.pre_existing,
		needs_reply: null,
	});
}

function discussionActionItem(comment: DiscussionCommentManifestItem, item: ClassifiedDiscussionCommentItem): FeedbackPlanDiscussionActionItem {
	return feedbackPlanDiscussionActionItemSchema.parse({
		...planSourceItemBase("discussion_comment", item.summary, {
			discussion_comment_id: comment.comment_id,
			body_locator: comment.body_locator,
			author: comment.author,
			url: comment.url,
		}),
		action_summary: item.action_summary,
		complexity: requiredActionComplexity(item.complexity),
		pre_existing: false,
		needs_reply: item.needs_reply,
	});
}

function informationalItems(view: FeedbackManifestView, classified: ClassifiedLookup): FeedbackPlanInformationalItem[] {
	const informational: FeedbackPlanInformationalItem[] = [];
	for (const review of view.reviews) {
		const item = classified.reviews.get(review.id);
		if (item?.disposition === "informational") informational.push(reviewInformationalItem(review, item));
	}
	for (const thread of view.requiredThreads) {
		const item = classified.threads.get(thread.thread_id);
		if (item?.disposition === "informational") informational.push(threadInformationalItem(thread, item));
	}
	for (const comment of view.discussionComments) {
		const item = classified.comments.get(comment.comment_id);
		if (item?.disposition === "informational") informational.push(discussionInformationalItem(comment, item));
	}
	return informational;
}

function reviewInformationalItem(review: ReviewManifestItem, item: ClassifiedReviewItem): FeedbackPlanReviewInformationalItem {
	return feedbackPlanReviewInformationalItemSchema.parse({
		...planSourceItemBase("review", item.summary, {
			review_id: review.id,
			review_state: review.state,
			submitted_at: review.submitted_at,
			body_locator: review.body_locator,
			author: review.author,
		}),
		informational_reason: item.informational_reason,
		user_decision_required: false,
		allowed_decisions: [],
	});
}

function threadInformationalItem(thread: ThreadManifestItem, item: ClassifiedThreadItem): FeedbackPlanThreadInformationalItem {
	const coveredComments = coveredThreadComments(thread, item);
	const firstComment = coveredComments[0] ?? null;
	return feedbackPlanThreadInformationalItemSchema.parse({
		...planSourceItemBase("review_thread", item.summary, {
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
		}),
		informational_reason: item.informational_reason,
		user_decision_required: true,
		allowed_decisions: [...INFORMATIONAL_THREAD_DECISIONS],
	});
}

function discussionInformationalItem(comment: DiscussionCommentManifestItem, item: ClassifiedDiscussionCommentItem): FeedbackPlanDiscussionInformationalItem {
	return feedbackPlanDiscussionInformationalItemSchema.parse({
		...planSourceItemBase("discussion_comment", item.summary, {
			discussion_comment_id: comment.comment_id,
			body_locator: comment.body_locator,
			author: comment.author,
			url: comment.url,
		}),
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

async function loadValidatePayload(
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
	stdin: () => Promise<string>,
): Promise<LoadPayloadResult<WrapperPayload>> {
	const hasSplitOptions = [request.manifest_json, request.manifest_file, request.classification_json, request.classification_file].some(
		(value) => value !== undefined,
	);
	if (!hasSplitOptions) {
		const result = await loadJsonInput({
			optionValue: request.payload_json,
			filePath: request.payload_file,
			commandName: "validate-feedback-classification",
			inputDescription: "wrapper payload",
			optionName: "--payload-json",
			fileOptionName: "--payload-file",
			schema: wrapperPayloadSchema,
			stdin,
		});
		if (result.type === "error") return { type: "error", errorType: result.error.errorType, message: result.error.message };
		return { type: "ok", value: result.value };
	}

	if (request.payload_json !== undefined || request.payload_file !== undefined) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "validate-feedback-classification cannot mix wrapper input (--payload-json/--payload-file) with split manifest/classification inputs.",
		};
	}
	const manifestSourceCount = Number(request.manifest_json !== undefined) + Number(request.manifest_file !== undefined);
	const classificationSourceCount = Number(request.classification_json !== undefined) + Number(request.classification_file !== undefined);
	if (manifestSourceCount !== 1 || classificationSourceCount !== 1) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "validate-feedback-classification split input requires exactly one manifest source (--manifest-json or --manifest-file) and exactly one classification source (--classification-json or --classification-file).",
		};
	}
	const manifest = await loadJsonObjectSource({
		inlineJson: request.manifest_json,
		filePath: request.manifest_file,
		canReadStdin: false,
		commandName: "validate-feedback-classification",
		inputName: "manifest",
		inlineOption: "--manifest-json",
		fileOption: "--manifest-file",
		stdin,
	});
	if (manifest.type === "error") return manifest;
	const classification = await loadJsonObjectSource({
		inlineJson: request.classification_json,
		filePath: request.classification_file,
		canReadStdin: false,
		commandName: "validate-feedback-classification",
		inputName: "classification",
		inlineOption: "--classification-json",
		fileOption: "--classification-file",
		stdin,
	});
	if (classification.type === "error") return classification;
	return { type: "ok", value: { manifest: manifest.value, classification: classification.value } };
}

interface LoadPayloadOk<T> {
	type: "ok";
	value: T;
}

interface LoadPayloadError {
	type: "error";
	errorType: "invalid_json" | "invalid_request";
	message: string;
}

type LoadPayloadResult<T> = LoadPayloadOk<T> | LoadPayloadError;

async function loadJsonObjectSource(options: {
	inlineJson: string | undefined;
	filePath: string | undefined;
	canReadStdin: boolean;
	commandName: string;
	inputName: string;
	inlineOption: string;
	fileOption: string;
	stdin: () => Promise<string>;
}): Promise<LoadPayloadResult<Record<string, unknown>>> {
	const textResult = await readJsonInputText({
		optionValue: options.inlineJson,
		filePath: options.filePath,
		canReadStdin: options.canReadStdin,
		commandName: options.commandName,
		inputDescription: options.inputName,
		optionName: options.inlineOption,
		fileOptionName: options.fileOption,
		stdin: options.stdin,
	});
	if (textResult.type === "error") return { type: "error", errorType: textResult.error.errorType, message: textResult.error.message };

	let parsed: unknown;
	try {
		parsed = JSON.parse(textResult.value);
	} catch (error) {
		return { type: "error", errorType: "invalid_json", message: `Invalid ${options.commandName} ${options.inputName}: ${jsonParseMessage(error)}` };
	}
	if (!isRecord(parsed)) {
		return { type: "error", errorType: "invalid_request", message: `${options.commandName} ${options.inputName} JSON must be an object.` };
	}
	return { type: "ok", value: parsed };
}

function classificationLocatorRef(locator: BodyLocator): Record<string, string | null> {
	return {
		json_pointer: locator.json_pointer,
		item_pointer: locator.item_pointer,
	};
}

function duplicateValues(values: Array<string | number>): Array<string | number> {
	const counts = new Map<string | number, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	const seen = new Set<string | number>();
	const duplicates: Array<string | number> = [];
	for (const value of values) {
		if ((counts.get(value) ?? 0) > 1 && !seen.has(value)) {
			duplicates.push(value);
			seen.add(value);
		}
	}
	return duplicates;
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

function duplicateCode(codePrefix: ExactOnceCodePrefix): string {
	if (codePrefix === "review") return "duplicate_review";
	if (codePrefix === "thread") return "duplicate_thread";
	if (codePrefix === "thread_comment") return "duplicate_thread_comment";
	return "duplicate_discussion_comment";
}

function unknownCode(codePrefix: ExactOnceCodePrefix): string {
	if (codePrefix === "review") return "unknown_review";
	if (codePrefix === "thread") return "unknown_thread";
	if (codePrefix === "thread_comment") return "unknown_thread_comment";
	return "unknown_discussion_comment";
}

function missingCode(codePrefix: ExactOnceCodePrefix): string {
	if (codePrefix === "review") return "missing_review";
	if (codePrefix === "thread") return "missing_thread";
	if (codePrefix === "thread_comment") return "missing_thread_comment";
	return "missing_discussion_comment";
}

function duplicateMessage(kind: ValidationItemKind, identifier: string | number, parentIdentifier: string | undefined): string {
	if (kind === "thread_comment" && parentIdentifier !== undefined) return `Thread comment ${identifier} is covered more than once in thread ${parentIdentifier}.`;
	return `${kindLabel(kind)} ${identifier} is classified more than once.`;
}

function unknownMessage(kind: ValidationItemKind, identifier: string | number, parentIdentifier: string | undefined): string {
	if (kind === "thread_comment" && parentIdentifier !== undefined) return `Thread comment ${identifier} is not present in thread ${parentIdentifier}.`;
	return `${kindLabel(kind)} ${identifier} is not present in the manifest.`;
}

function missingMessage(kind: ValidationItemKind, identifier: string | number, parentIdentifier: string | undefined): string {
	if (kind === "thread_comment" && parentIdentifier !== undefined) return `Thread comment ${identifier} is missing from thread ${parentIdentifier} coverage.`;
	return `${kindLabel(kind)} ${identifier} is missing from the classification packet.`;
}

function kindLabel(kind: ValidationItemKind): string {
	return kind.replaceAll("_", " ");
}

function pythonRepr(value: string | null): string {
	if (value === null) return "None";
	return `'${value}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonParseMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

import { type JsonSchemaDocument } from "@asdl/clinkr";

import {
	buildClassificationTemplateSchemaDocument,
	buildPlanFeedbackSchemaDocument,
	buildValidateFeedbackClassificationSchemaDocument,
} from "./classification.ts";
import {
	downloadFeedbackRequestSchema,
	downloadFeedbackResultSchema,
	getFeedbackRequestSchema,
	getFeedbackResultSchema,
	mapBranchPrsRequestSchema,
	mapBranchPrsResultSchema,
	prepareRunRequestSchema,
	prepareRunResultSchema,
	readFeedbackDetailRequestSchema,
	readFeedbackDetailResultSchema,
	readFeedbackDetailsRequestSchema,
	readFeedbackDetailsResultSchema,
} from "./collection.ts";
import {
	replyToDiscussionRequestSchema,
	replyToDiscussionResultSchema,
	replyToReviewRequestSchema,
	replyToReviewResultSchema,
	resolveThreadBatchRequestSchema,
	resolveThreadBatchResultSchema,
	resolveThreadWithReplyRequestSchema,
	resolveThreadWithReplyResultSchema,
} from "./mutation.ts";
import {
	buildResolveThreadBatchPayloadRequestSchema,
	buildResolveThreadBatchPayloadResultSchema,
	finalizeRunRequestSchema,
	finalizeRunResultSchema,
	recordBatchCheckpointRequestSchema,
	recordBatchCheckpointResultSchema,
} from "./payload.ts";
import { schemaDocument } from "./shared.ts";

// TypeScript-owned `--json-schema` documents for every pr-address exec operation.
//
// Schema document builders are organized in operation-schemas/ subdirectory:
// - classification.ts: classification trio (template, validate, plan)
// - collection.ts, mutation.ts, payload.ts: collection, mutation, and payload schemas
//
// The scenario route test locks every emitted schema document against an exact
// generated fixture.
//
// Conventions:
// - Closed request/result objects use `z.object` (emits `additionalProperties: false`).
// - Open gateway-shaped records use `z.looseObject`.
// - Fields with defaults use `.optional()`; explicit-null fields use `.nullable()`.

// --- document registry --------------------------------------------------------------

const SCHEMA_DOCUMENT_BUILDERS: ReadonlyMap<string, () => JsonSchemaDocument> = new Map([
	["build-resolve-thread-batch-payload", () => schemaDocument(buildResolveThreadBatchPayloadRequestSchema, buildResolveThreadBatchPayloadResultSchema)],
	["classification-template", buildClassificationTemplateSchemaDocument],
	["download-feedback", () => schemaDocument(downloadFeedbackRequestSchema, downloadFeedbackResultSchema)],
	["finalize-run", () => schemaDocument(finalizeRunRequestSchema, finalizeRunResultSchema)],
	["get-feedback", () => schemaDocument(getFeedbackRequestSchema, getFeedbackResultSchema)],
	["map-branch-prs", () => schemaDocument(mapBranchPrsRequestSchema, mapBranchPrsResultSchema)],
	["plan-feedback", buildPlanFeedbackSchemaDocument],
	["prepare-run", () => schemaDocument(prepareRunRequestSchema, prepareRunResultSchema)],
	["read-feedback-detail", () => schemaDocument(readFeedbackDetailRequestSchema, readFeedbackDetailResultSchema)],
	["read-feedback-details", () => schemaDocument(readFeedbackDetailsRequestSchema, readFeedbackDetailsResultSchema)],
	["record-batch-checkpoint", () => schemaDocument(recordBatchCheckpointRequestSchema, recordBatchCheckpointResultSchema)],
	["reply-to-discussion", () => schemaDocument(replyToDiscussionRequestSchema, replyToDiscussionResultSchema)],
	["reply-to-review", () => schemaDocument(replyToReviewRequestSchema, replyToReviewResultSchema)],
	["resolve-thread-batch", () => schemaDocument(resolveThreadBatchRequestSchema, resolveThreadBatchResultSchema)],
	["resolve-thread-with-reply", () => schemaDocument(resolveThreadWithReplyRequestSchema, resolveThreadWithReplyResultSchema)],
	["validate-feedback-classification", buildValidateFeedbackClassificationSchemaDocument],
]);

export function buildOperationSchemaDocument(operation: string): JsonSchemaDocument | undefined {
	const builder = SCHEMA_DOCUMENT_BUILDERS.get(operation);
	return builder?.();
}

/** Operation names with a pinned schema document; the exec table must match 1:1. */
export function operationSchemaDocumentNames(): readonly string[] {
	return [...SCHEMA_DOCUMENT_BUILDERS.keys()];
}

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
	summarizeFeedbackRequestSchema,
	summarizeFeedbackResultSchema,
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
import { schemaDocument, stackFeedbackDiffCurrentRequestSchema } from "./shared.ts";
import {
	buildStackResolveThreadPayloadsRequestSchema,
	buildStackResolveThreadPayloadsResultSchema,
	stackFeedbackDiffCurrentResultSchema,
	stackFeedbackPlanRequestSchema,
	stackFeedbackPlanResultUnionSchema,
	stackFeedbackPreflightRequestSchema,
	stackFeedbackPreflightResultUnionSchema,
	stackFeedbackPrepRequestSchema,
	stackFeedbackPrepResultUnionSchema,
	stackFeedbackThreadStateRequestSchema,
	stackFeedbackThreadStateResultUnionSchema,
} from "./stack.ts";

// TypeScript-owned `--json-schema` documents for every pr-address exec operation.
//
// Schema document builders are organized in operation-schemas/ subdirectory:
// - classification.ts: classification trio (template, validate, plan) — early TS-owned schemas
// - collection.ts, mutation.ts, payload.ts, stack.ts: contract-pinned operation schemas
//
// Contract-pinned schemas are checked at the structural-semantic level: property
// sets, required-ness, types, enums, explicit nullability, and object openness are
// locked against captured schema contract fixtures in `test/scenario/json-schema-routes.test.ts`.
// Dialect details such as titles, `$defs` naming, and integer bounds may differ.
//
// Conventions:
// - Closed request/result objects use `z.object` (emits `additionalProperties: false`).
// - Open gateway-shaped records use `z.looseObject`.
// - Fields with defaults use `.optional()`; explicit-null fields use `.nullable()`.

// --- document registry --------------------------------------------------------------

const SCHEMA_DOCUMENT_BUILDERS: ReadonlyMap<string, () => JsonSchemaDocument> = new Map([
	["build-resolve-thread-batch-payload", () => schemaDocument(buildResolveThreadBatchPayloadRequestSchema, buildResolveThreadBatchPayloadResultSchema)],
	["build-stack-resolve-thread-payloads", () => schemaDocument(buildStackResolveThreadPayloadsRequestSchema, buildStackResolveThreadPayloadsResultSchema)],
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
	["stack-feedback-diff-current", () => schemaDocument(stackFeedbackDiffCurrentRequestSchema, stackFeedbackDiffCurrentResultSchema)],
	["stack-feedback-plan", () => schemaDocument(stackFeedbackPlanRequestSchema, stackFeedbackPlanResultUnionSchema)],
	["stack-feedback-preflight", () => schemaDocument(stackFeedbackPreflightRequestSchema, stackFeedbackPreflightResultUnionSchema)],
	["stack-feedback-prep", () => schemaDocument(stackFeedbackPrepRequestSchema, stackFeedbackPrepResultUnionSchema)],
	["stack-feedback-thread-state", () => schemaDocument(stackFeedbackThreadStateRequestSchema, stackFeedbackThreadStateResultUnionSchema)],
	["summarize-feedback", () => schemaDocument(summarizeFeedbackRequestSchema, summarizeFeedbackResultSchema)],
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

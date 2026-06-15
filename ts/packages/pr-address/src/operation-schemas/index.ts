import { type JsonSchemaDocument } from "@asdl/clinkr";

import {
	buildClassificationTemplateSchemaDocument,
	buildPlanFeedbackSchemaDocument,
	buildValidateFeedbackClassificationSchemaDocument,
} from "./classification.ts";
import {
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
	readThreadBodiesRequestSchema,
	readThreadBodiesResultSchema,
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
	verifyStackBatchCurrentRequestSchema,
	verifyStackBatchCurrentResultSchema,
} from "./stack.ts";

// TypeScript-owned `--json-schema` documents for every pr-address exec operation.
//
// Schema document builders are organized in operation-schemas/ subdirectory:
// - classification.ts: classification trio (template, validate, plan) — legacy TS-owned schemas
// - collection.ts, mutation.ts, payload.ts, stack.ts: parity-pinned operation schemas
//
// Parity-pinned schemas mirror the legacy Python (Pydantic) request/result contracts at the
// structural-semantic level: property sets, required-ness, types, enums, and explicit
// nullability match the Python documents, while dialect details (titles, `$defs`
// naming, integer bounds) may differ. Parity is enforced against captured Python
// fixtures in `test/scenario/json-schema-routes.test.ts`.
//
// Conventions:
// - Pydantic `ClinkrModel` / `BaseModel(extra="forbid")` mirrors use `z.object`
//   (emits `additionalProperties: false`).
// - Pydantic dataclass mirrors (gh/git types) use `z.looseObject` (open objects).
// - Fields with Python defaults use `.optional()`; explicit-null fields use `.nullable()`.

// --- document registry --------------------------------------------------------------

const SCHEMA_DOCUMENT_BUILDERS: ReadonlyMap<string, () => JsonSchemaDocument> = new Map([
	["build-resolve-thread-batch-payload", () => schemaDocument(buildResolveThreadBatchPayloadRequestSchema, buildResolveThreadBatchPayloadResultSchema)],
	["build-stack-resolve-thread-payloads", () => schemaDocument(buildStackResolveThreadPayloadsRequestSchema, buildStackResolveThreadPayloadsResultSchema)],
	["classification-template", buildClassificationTemplateSchemaDocument],
	["finalize-run", () => schemaDocument(finalizeRunRequestSchema, finalizeRunResultSchema)],
	["get-feedback", () => schemaDocument(getFeedbackRequestSchema, getFeedbackResultSchema)],
	["map-branch-prs", () => schemaDocument(mapBranchPrsRequestSchema, mapBranchPrsResultSchema)],
	["plan-feedback", buildPlanFeedbackSchemaDocument],
	["prepare-run", () => schemaDocument(prepareRunRequestSchema, prepareRunResultSchema)],
	["read-feedback-detail", () => schemaDocument(readFeedbackDetailRequestSchema, readFeedbackDetailResultSchema)],
	["read-feedback-details", () => schemaDocument(readFeedbackDetailsRequestSchema, readFeedbackDetailsResultSchema)],
	["read-thread-bodies", () => schemaDocument(readThreadBodiesRequestSchema, readThreadBodiesResultSchema)],
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
	["verify-stack-batch-current", () => schemaDocument(verifyStackBatchCurrentRequestSchema, verifyStackBatchCurrentResultSchema)],
]);

export function buildOperationSchemaDocument(operation: string): JsonSchemaDocument | undefined {
	const builder = SCHEMA_DOCUMENT_BUILDERS.get(operation);
	return builder?.();
}

/** Operation names with a pinned schema document; the exec table must match 1:1. */
export function operationSchemaDocumentNames(): readonly string[] {
	return [...SCHEMA_DOCUMENT_BUILDERS.keys()];
}

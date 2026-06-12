import { z } from "zod";

import {
	buildClassificationTemplateSchemaDocument,
	buildPlanFeedbackSchemaDocument,
	buildValidateFeedbackClassificationSchemaDocument,
	type JsonSchemaDocument,
} from "../classification-schemas.ts";
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
	summarizeFeedbackRequestSchema,
	summarizeFeedbackResultSchema,
} from "./collection.ts";
import {
	replyToDiscussionRequestSchema,
	replyToDiscussionResultSchema,
	replyToReviewRequestSchema,
	replyToReviewResultSchema,
	resolveThreadBatchResultSchema,
	resolveThreadWithReplyRequestSchema,
	resolveThreadWithReplyResultSchema,
} from "./mutation.ts";
import { buildResolveThreadBatchPayloadResultSchema, finalizeRunResultSchema, recordBatchCheckpointResultSchema } from "./payload.ts";
import { buildStackResolveThreadPayloadsRequestSchema, payloadJsonOrFileRequestSchema, stackFeedbackDiffCurrentRequestSchema } from "./shared.ts";
import {
	buildStackResolveThreadPayloadsResultSchema,
	stackFeedbackDiffCurrentResultSchema,
	stackFeedbackPlanRequestSchema,
	stackFeedbackPlanResultUnionSchema,
	stackFeedbackPreflightRequestSchema,
	stackFeedbackPreflightResultUnionSchema,
	stackFeedbackPrepRequestSchema,
	stackFeedbackPrepResultUnionSchema,
} from "./stack.ts";

// TypeScript-owned `--json-schema` documents for every pr-address exec operation.
//
// These schemas mirror the legacy Python (Pydantic) request/result contracts at the
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

function schemaDocument(requestSchema: z.ZodType, resultSchema: z.ZodType): JsonSchemaDocument {
	return {
		input_json_schema: z.toJSONSchema(requestSchema),
		output_json_schema: z.toJSONSchema(resultSchema),
	};
}

const SCHEMA_DOCUMENT_BUILDERS: ReadonlyMap<string, () => JsonSchemaDocument> = new Map([
	["build-resolve-thread-batch-payload", () => schemaDocument(payloadJsonOrFileRequestSchema, buildResolveThreadBatchPayloadResultSchema)],
	["build-stack-resolve-thread-payloads", () => schemaDocument(buildStackResolveThreadPayloadsRequestSchema, buildStackResolveThreadPayloadsResultSchema)],
	["classification-template", buildClassificationTemplateSchemaDocument],
	["finalize-run", () => schemaDocument(payloadJsonOrFileRequestSchema, finalizeRunResultSchema)],
	["get-feedback", () => schemaDocument(getFeedbackRequestSchema, getFeedbackResultSchema)],
	["map-branch-prs", () => schemaDocument(mapBranchPrsRequestSchema, mapBranchPrsResultSchema)],
	["plan-feedback", buildPlanFeedbackSchemaDocument],
	["prepare-run", () => schemaDocument(prepareRunRequestSchema, prepareRunResultSchema)],
	["read-feedback-detail", () => schemaDocument(readFeedbackDetailRequestSchema, readFeedbackDetailResultSchema)],
	["read-feedback-details", () => schemaDocument(readFeedbackDetailsRequestSchema, readFeedbackDetailsResultSchema)],
	["record-batch-checkpoint", () => schemaDocument(payloadJsonOrFileRequestSchema, recordBatchCheckpointResultSchema)],
	["reply-to-discussion", () => schemaDocument(replyToDiscussionRequestSchema, replyToDiscussionResultSchema)],
	["reply-to-review", () => schemaDocument(replyToReviewRequestSchema, replyToReviewResultSchema)],
	["resolve-thread-batch", () => schemaDocument(payloadJsonOrFileRequestSchema, resolveThreadBatchResultSchema)],
	["resolve-thread-with-reply", () => schemaDocument(resolveThreadWithReplyRequestSchema, resolveThreadWithReplyResultSchema)],
	["stack-feedback-diff-current", () => schemaDocument(stackFeedbackDiffCurrentRequestSchema, stackFeedbackDiffCurrentResultSchema)],
	["stack-feedback-plan", () => schemaDocument(stackFeedbackPlanRequestSchema, stackFeedbackPlanResultUnionSchema)],
	["stack-feedback-preflight", () => schemaDocument(stackFeedbackPreflightRequestSchema, stackFeedbackPreflightResultUnionSchema)],
	["stack-feedback-prep", () => schemaDocument(stackFeedbackPrepRequestSchema, stackFeedbackPrepResultUnionSchema)],
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

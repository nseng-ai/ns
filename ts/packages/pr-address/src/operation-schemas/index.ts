import { type JsonSchemaDocument } from "@asdl/clinkr";
import type { z } from "zod";

import {
	downloadFeedbackResultSchema,
	mapBranchPrsResultSchema,
	openPrsResultSchema,
	prDiscussionCommentsResultSchema,
	prLookupResultSchema,
	prReviewsResultSchema,
	prReviewThreadsResultSchema,
	replyReviewThreadResultSchema,
	resolveReviewThreadResultSchema,
} from "./collection.ts";
import { schemaDocument } from "./shared.ts";

// TypeScript-owned `--json-schema` result documents for pr-address exec operations.
const RESULT_SCHEMAS: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
	["download-feedback", downloadFeedbackResultSchema],
	["map-branch-prs", mapBranchPrsResultSchema],
	["pr-details", prLookupResultSchema],
	["branch-pr", prLookupResultSchema],
	["open-prs", openPrsResultSchema],
	["pr-reviews", prReviewsResultSchema],
	["pr-review-threads", prReviewThreadsResultSchema],
	["pr-discussion-comments", prDiscussionCommentsResultSchema],
	["reply-review-thread", replyReviewThreadResultSchema],
	["resolve-review-thread", resolveReviewThreadResultSchema],
]);

export function buildOperationSchemaDocument(
	operation: string,
	requestSchema: z.ZodObject,
): JsonSchemaDocument | undefined {
	const resultSchema = RESULT_SCHEMAS.get(operation);
	if (resultSchema === undefined) return undefined;
	return schemaDocument(requestSchema, resultSchema);
}

/** Operation names with a pinned schema document; the exec table must match 1:1. */
export function operationSchemaDocumentNames(): readonly string[] {
	return [...RESULT_SCHEMAS.keys()];
}

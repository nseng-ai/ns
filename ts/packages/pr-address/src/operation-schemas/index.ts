import { type JsonSchemaDocument } from "@asdl/clinkr";

import {
	branchPrRequestSchema,
	downloadFeedbackRequestSchema,
	downloadFeedbackResultSchema,
	emptyRequestSchema,
	mapBranchPrsRequestSchema,
	mapBranchPrsResultSchema,
	openPrsResultSchema,
	prDetailsRequestSchema,
	prDiscussionCommentsResultSchema,
	prLookupResultSchema,
	prReviewsResultSchema,
	prReviewThreadsRequestSchema,
	prReviewThreadsResultSchema,
	replyReviewThreadRequestSchema,
	replyReviewThreadResultSchema,
	resolveReviewThreadRequestSchema,
	resolveReviewThreadResultSchema,
} from "./collection.ts";
import { schemaDocument } from "./shared.ts";

// TypeScript-owned `--json-schema` documents for pr-address exec operations.
const SCHEMA_DOCUMENT_BUILDERS: ReadonlyMap<string, () => JsonSchemaDocument> = new Map([
	[
		"download-feedback",
		() => schemaDocument(downloadFeedbackRequestSchema, downloadFeedbackResultSchema),
	],
	["map-branch-prs", () => schemaDocument(mapBranchPrsRequestSchema, mapBranchPrsResultSchema)],
	["pr-details", () => schemaDocument(prDetailsRequestSchema, prLookupResultSchema)],
	["branch-pr", () => schemaDocument(branchPrRequestSchema, prLookupResultSchema)],
	["open-prs", () => schemaDocument(emptyRequestSchema, openPrsResultSchema)],
	["pr-reviews", () => schemaDocument(prDetailsRequestSchema, prReviewsResultSchema)],
	[
		"pr-review-threads",
		() => schemaDocument(prReviewThreadsRequestSchema, prReviewThreadsResultSchema),
	],
	[
		"pr-discussion-comments",
		() => schemaDocument(prDetailsRequestSchema, prDiscussionCommentsResultSchema),
	],
	[
		"reply-review-thread",
		() => schemaDocument(replyReviewThreadRequestSchema, replyReviewThreadResultSchema),
	],
	[
		"resolve-review-thread",
		() => schemaDocument(resolveReviewThreadRequestSchema, resolveReviewThreadResultSchema),
	],
]);

export function buildOperationSchemaDocument(operation: string): JsonSchemaDocument | undefined {
	const builder = SCHEMA_DOCUMENT_BUILDERS.get(operation);
	return builder?.();
}

/** Operation names with a pinned schema document; the exec table must match 1:1. */
export function operationSchemaDocumentNames(): readonly string[] {
	return [...SCHEMA_DOCUMENT_BUILDERS.keys()];
}

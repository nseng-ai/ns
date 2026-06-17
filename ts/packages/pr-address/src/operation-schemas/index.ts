import { type JsonSchemaDocument } from "@asdl/clinkr";

import { downloadFeedbackRequestSchema, downloadFeedbackResultSchema, mapBranchPrsRequestSchema, mapBranchPrsResultSchema } from "./collection.ts";
import { schemaDocument } from "./shared.ts";

// TypeScript-owned `--json-schema` documents for retained downloader-only pr-address exec operations.
const SCHEMA_DOCUMENT_BUILDERS: ReadonlyMap<string, () => JsonSchemaDocument> = new Map([
	["download-feedback", () => schemaDocument(downloadFeedbackRequestSchema, downloadFeedbackResultSchema)],
	["map-branch-prs", () => schemaDocument(mapBranchPrsRequestSchema, mapBranchPrsResultSchema)],
]);

export function buildOperationSchemaDocument(operation: string): JsonSchemaDocument | undefined {
	const builder = SCHEMA_DOCUMENT_BUILDERS.get(operation);
	return builder?.();
}

/** Operation names with a pinned schema document; the exec table must match 1:1. */
export function operationSchemaDocumentNames(): readonly string[] {
	return [...SCHEMA_DOCUMENT_BUILDERS.keys()];
}

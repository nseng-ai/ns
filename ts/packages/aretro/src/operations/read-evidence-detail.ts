import { failure } from "@asdl/clinkr";
import { z } from "zod";

import type { AretroCliContext } from "../context.ts";

export const readEvidenceDetailRequestSchema = z.object({
	pointer: z.string(),
});

export type ReadEvidenceDetailRequest = z.infer<typeof readEvidenceDetailRequestSchema>;

export const readEvidenceDetailResultSchema = z.object({});

export type ReadEvidenceDetailResult = z.infer<typeof readEvidenceDetailResultSchema>;

export async function runReadEvidenceDetail(
	_context: AretroCliContext,
	_request: ReadEvidenceDetailRequest,
) {
	return failure(
		"not-yet-implemented",
		"Not yet implemented: read-evidence-detail is a placeholder for future payload detail work.",
	);
}

export function renderReadEvidenceDetail(): string {
	return "Not yet implemented: read-evidence-detail is a placeholder for future payload detail work.";
}

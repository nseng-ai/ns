import { formatZodIssue } from "@nseng-ai/foundation/primitives";

import { listCandidatesResultSchema, type ObjectiveCandidateRecord } from "./candidate-listing.ts";

export type ObjectiveCandidatesParseResult =
	| { type: "valid"; records: ObjectiveCandidateRecord[] }
	| { type: "invalid"; message: string };

export interface ObjectiveCliCompletionItem {
	value: string;
	label?: string;
	description?: string;
}

export function parseObjectiveCandidatesData(data: unknown): ObjectiveCandidatesParseResult {
	const parsed = listCandidatesResultSchema.safeParse(data);
	if (!parsed.success) {
		return {
			type: "invalid",
			message: `Invalid objective candidates JSON: ${formatZodIssue(parsed.error.issues[0], { fallback: "invalid data" })}`,
		};
	}

	return { type: "valid", records: parsed.data.records };
}

export function objectiveCompletionItem(
	record: ObjectiveCandidateRecord,
): ObjectiveCliCompletionItem {
	return { value: record.slug, label: record.slug, description: record.status };
}

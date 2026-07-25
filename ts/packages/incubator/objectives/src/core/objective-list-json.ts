import { formatZodIssue } from "@nseng-ai/foundation/primitives";

import {
	objectiveListResultSchema,
	type ObjectiveListResult,
} from "./operations/list-objectives.ts";

export interface ObjectiveListParseValid {
	type: "valid";
	list: ObjectiveListResult;
}

export interface ObjectiveListParseInvalid {
	type: "invalid";
	message: string;
}

export type ObjectiveListParseResult = ObjectiveListParseValid | ObjectiveListParseInvalid;

export function parseObjectiveListData(data: unknown): ObjectiveListParseResult {
	const parsed = objectiveListResultSchema.safeParse(data);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return {
			type: "invalid",
			message: `Invalid objective list JSON: ${formatZodIssue(issue, { fallback: "invalid data" })}`,
		};
	}

	return { type: "valid", list: parsed.data };
}

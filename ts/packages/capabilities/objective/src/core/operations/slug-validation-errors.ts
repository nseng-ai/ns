import { negative, type ClinkrExit } from "@ji/clinkr";

import { pythonStringRepr } from "./format.ts";

interface ObjectiveSlugValidationResult {
	status: string;
}

export function handleObjectiveSlugValidationErrors<Result extends ObjectiveSlugValidationResult>(
	result: Result,
	slug: string | undefined,
): ClinkrExit<Result> | null {
	if (result.status === "missing-slug") {
		return negative("Missing Objective slug. Pass an explicit slug.", { data: result });
	}
	if (result.status === "invalid-slug") {
		return negative(
			`Invalid Objective slug ${pythonStringRepr(slug ?? "")}. Pass a single slug, not a path.`,
			{ data: result },
		);
	}
	return null;
}

import { negative, type ClinkrExit } from "@asdl/clinkr";

import { pythonStringRepr } from "./format.ts";

interface ObjectiveSlugValidationResult {
	status: string;
}

export function handleObjectiveSlugValidationErrors<Result extends ObjectiveSlugValidationResult>(
	result: Result,
	slug: string | undefined,
): ClinkrExit<Result> | null {
	if (result.status === "missing_slug") {
		return negative("Missing Objective slug. Pass an explicit slug.", result);
	}
	if (result.status === "invalid_slug") {
		return negative(
			`Invalid Objective slug ${pythonStringRepr(slug ?? "")}. Pass a single slug, not a path.`,
			result,
		);
	}
	return null;
}

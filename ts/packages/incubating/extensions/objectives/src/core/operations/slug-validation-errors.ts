import { negative, type ClinkrExit } from "@nseng-ai/clinkr/legacy";

import { pythonStringRepr } from "./format.ts";

interface ObjectiveSelectorValidationResult {
	status: string;
	message?: string | undefined;
}

/**
 * Shared negative exits for the non-resolvable Objective Locator selector
 * statuses (missing/invalid selector, unavailable current owner).
 */
export function handleObjectiveSlugValidationErrors<
	Result extends ObjectiveSelectorValidationResult,
>(result: Result, selector: string | undefined): ClinkrExit<Result> | null {
	if (result.status === "missing-slug") {
		return negative("Missing Objective locator. Pass <owner>/<slug> or an owner-local slug.", {
			data: result,
		});
	}
	if (result.status === "invalid-slug") {
		return negative(
			result.message ??
				`Invalid Objective locator ${pythonStringRepr(selector ?? "")}. Pass <owner>/<slug> or an owner-local slug.`,
			{ data: result },
		);
	}
	if (result.status === "owner-unavailable") {
		return negative(
			result.message ??
				`Cannot resolve bare Objective slug ${pythonStringRepr(selector ?? "")}: no authenticated owner. Pass a full <owner>/<slug> locator.`,
			{ data: result },
		);
	}
	return null;
}

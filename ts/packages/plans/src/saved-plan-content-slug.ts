import type { CommandExecApi } from "@asdl/core/exec";
import { buildContentSlugPrompt, deriveContentSlug, type ContentSlugDerivationVariant, type ContentSlugEvidence } from "./content-slug-derivation.ts";

export type SavedPlanContentSlugEvidence = ContentSlugEvidence;

const SAVED_PLAN_CONTENT_SLUG_VARIANT: ContentSlugDerivationVariant = {
	slugKind: "saved-plan filename slug",
	promptIntroLines: [
		"Generate the saved-plan filename slug for the Markdown implementation plan content below.",
		"Use only the final plan content. Do not use the current branch, repository name, request text, filename, or path.",
	],
	invalidSlugMessage: "Pi slug model output normalized to an invalid saved-plan filename slug.",
	failureHeader: "Failed to derive saved-plan filename slug from plan content.",
	noFallbackLine: "No assistant-generated slug or deterministic fallback was attempted.",
};

export async function deriveSavedPlanContentSlug(
	pi: CommandExecApi,
	input: { content: string; cwd: string; signal?: AbortSignal | undefined },
): Promise<SavedPlanContentSlugEvidence> {
	return deriveContentSlug(pi, input, SAVED_PLAN_CONTENT_SLUG_VARIANT);
}

export function buildSavedPlanContentSlugPrompt(content: string): string {
	return buildContentSlugPrompt(content, SAVED_PLAN_CONTENT_SLUG_VARIANT);
}

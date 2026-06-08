import {
	buildContentSlugPrompt,
	deriveContentSlug,
	type ContentSlugDerivationVariant,
	type ContentSlugEvidence,
} from "./content-slug-derivation.ts";
import { planFileFormatForKind, type PlanCommandExecApi, type PlanFileKind } from "@asdl/planned-branch";

export type SavedPlanContentSlugEvidence = ContentSlugEvidence;

function savedPlanContentSlugVariant(kind: PlanFileKind): ContentSlugDerivationVariant {
	const format = planFileFormatForKind(kind);
	return {
		slugKind: "saved-plan filename slug",
		promptIntroLines: [
			`Generate the saved-plan filename slug for the ${format.slugPromptContentDescription} below.`,
			"Use only the final plan content. Do not use the current branch, repository name, request text, filename, or path.",
		],
		invalidSlugMessage: "Pi slug model output normalized to an invalid saved-plan filename slug.",
		failureHeader: "Failed to derive saved-plan filename slug from plan content.",
		noFallbackLine: "No assistant-generated slug or deterministic fallback was attempted.",
	};
}

export async function deriveSavedPlanContentSlug(
	pi: PlanCommandExecApi,
	input: { content: string; cwd: string; signal?: AbortSignal | undefined; planFileKind?: PlanFileKind | undefined },
): Promise<SavedPlanContentSlugEvidence> {
	return deriveContentSlug(pi, input, savedPlanContentSlugVariant(input.planFileKind ?? "markdown"));
}

export function buildSavedPlanContentSlugPrompt(content: string, planFileKind: PlanFileKind = "markdown"): string {
	return buildContentSlugPrompt(content, savedPlanContentSlugVariant(planFileKind));
}

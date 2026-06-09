import { readFile } from "node:fs/promises";

import {
	MAX_PLAN_CONTENT_CHARS,
	buildContentSlugPrompt,
	deriveContentSlug,
	normalizePlanContentSlugOutput,
	truncatePlanContentForSlug,
	type ContentSlugDerivationVariant,
	type ContentSlugEvidence,
} from "./content-slug-derivation.ts";
import type { PlanCommandExecApi } from "@asdl/plans";

export { MAX_PLAN_CONTENT_CHARS, normalizePlanContentSlugOutput, truncatePlanContentForSlug };
export type PlanContentSlugEvidence = ContentSlugEvidence;

const PLAN_CONTENT_SLUG_VARIANT: ContentSlugDerivationVariant = {
	slugKind: "planned-branch slug",
	promptIntroLines: [
		"Generate the planned-branch slug for the Markdown implementation plan content below.",
		"Use only the plan content. Do not use any saved-plan filename or path.",
	],
	invalidSlugMessage: "Pi slug model output normalized to an invalid planned-branch slug.",
	failureHeader: "Failed to derive planned-branch slug from plan content.",
	noFallbackLine: "No filename or deterministic fallback was attempted.",
};

export async function derivePlanContentSlug(
	pi: PlanCommandExecApi,
	input: { filePath: string; cwd: string; signal?: AbortSignal | undefined },
): Promise<PlanContentSlugEvidence> {
	const content = await readFile(input.filePath, "utf8");
	return deriveContentSlug(pi, { content, cwd: input.cwd, ...(input.signal === undefined ? {} : { signal: input.signal }) }, PLAN_CONTENT_SLUG_VARIANT);
}

export function buildPlanContentSlugPrompt(content: string): string {
	return buildContentSlugPrompt(content, PLAN_CONTENT_SLUG_VARIANT);
}

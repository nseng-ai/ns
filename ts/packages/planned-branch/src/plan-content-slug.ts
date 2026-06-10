import { readFile } from "node:fs/promises";

import type { CommandExecApi } from "@asdl/core/exec";
import {
	MAX_PLAN_CONTENT_CHARS,
	buildContentSlugPrompt,
	deriveContentSlug,
	normalizePlanContentSlugOutput,
	truncatePlanContentForSlug,
	type ContentSlugDerivationVariant,
	type ContentSlugEvidence,
} from "@asdl/plans";

export { MAX_PLAN_CONTENT_CHARS, normalizePlanContentSlugOutput, truncatePlanContentForSlug };
export type PlanContentSlugEvidence = ContentSlugEvidence;

export interface DerivePlanContentSlugInput {
	filePath: string;
	cwd: string;
	signal?: AbortSignal | undefined;
	readTextFile?: ((path: string) => Promise<string>) | undefined;
}

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

export async function derivePlanContentSlug(pi: CommandExecApi, input: DerivePlanContentSlugInput): Promise<PlanContentSlugEvidence> {
	const readTextFile = input.readTextFile ?? defaultReadTextFile;
	const content = await readTextFile(input.filePath);
	return deriveContentSlug(pi, { content, cwd: input.cwd, ...(input.signal === undefined ? {} : { signal: input.signal }) }, PLAN_CONTENT_SLUG_VARIANT);
}

function defaultReadTextFile(path: string): Promise<string> {
	return readFile(path, "utf8");
}

export function buildPlanContentSlugPrompt(content: string): string {
	return buildContentSlugPrompt(content, PLAN_CONTENT_SLUG_VARIANT);
}

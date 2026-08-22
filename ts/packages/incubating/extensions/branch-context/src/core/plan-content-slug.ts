import { readFile } from "node:fs/promises";

import type {
	ContentSlugContext,
	ContentSlugEvidence,
	ContentSlugResult,
} from "@nseng-ai/extension-kit/content-slug";
import { derivePlanSlugFromContent } from "@nseng-ai/plans/api";

export type PlanContentSlugEvidence = ContentSlugEvidence;
export type PlanContentSlugResult = ContentSlugResult;

export interface DerivePlanContentSlugInput {
	filePath: string;
	cwd: string;
	signal?: AbortSignal;
	readTextFile?: (path: string) => Promise<string>;
}

const BRANCH_CONTEXT_PLAN_PRESENTATION = {
	slugKind: "branch-context slug",
	promptIntroLines: [
		"Generate the branch-context slug for the Markdown implementation plan content below.",
		"Use only the plan content. Do not use any saved-plan filename or path.",
	],
	invalidSlugMessage: "Pi slug model output normalized to an invalid branch-context slug.",
	failureHeader: "Failed to derive branch-context slug from plan content.",
	noFallbackLine: "No filename or deterministic fallback was attempted.",
};

export async function derivePlanContentSlug(
	context: ContentSlugContext,
	input: DerivePlanContentSlugInput,
): Promise<PlanContentSlugResult> {
	const readTextFile = input.readTextFile ?? defaultReadTextFile;
	const content = await readTextFile(input.filePath);
	return derivePlanSlugFromContent(
		context,
		{ content, cwd: input.cwd, ...(input.signal === undefined ? {} : { signal: input.signal }) },
		BRANCH_CONTEXT_PLAN_PRESENTATION,
	);
}

function defaultReadTextFile(path: string): Promise<string> {
	return readFile(path, "utf8");
}

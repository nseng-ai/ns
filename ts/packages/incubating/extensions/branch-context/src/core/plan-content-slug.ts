import { readFile } from "node:fs/promises";

import type {
	ContentSlugContext,
	ContentSlugEvidence,
	ContentSlugFailure,
} from "@nseng-ai/extension-kit/content-slug";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { Result } from "@nseng-ai/foundation/result";
import { derivePlanSlugFromContent } from "@nseng-ai/plans/api";

export type PlanContentSlugEvidence = ContentSlugEvidence;

export interface PlanContentReadFailure {
	readonly code: "plan-content-read-failed";
	readonly message: string;
}

export type PlanContentSlugResult = Result<
	PlanContentSlugEvidence,
	ContentSlugFailure | PlanContentReadFailure
>;

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
	const content = await readPlanContent(input);
	if (!content.ok) return content;
	return derivePlanSlugFromContent(
		context,
		{
			content: content.value,
			cwd: input.cwd,
			...optionalEntry("signal", input.signal),
		},
		BRANCH_CONTEXT_PLAN_PRESENTATION,
	);
}

function readPlanContent(
	input: Pick<DerivePlanContentSlugInput, "filePath" | "readTextFile">,
): Promise<Result<string, PlanContentReadFailure>> {
	if (input.readTextFile === undefined) return defaultReadTextFile(input.filePath);
	return input.readTextFile(input.filePath).then((value) => ({ ok: true, value }));
}

async function defaultReadTextFile(path: string): Promise<Result<string, PlanContentReadFailure>> {
	try {
		return { ok: true, value: await readFile(path, "utf8") };
	} catch (error) {
		return {
			ok: false,
			error: {
				code: "plan-content-read-failed",
				message: `Could not read plan content from ${path}: ${formatErrorMessage(error)}`,
			},
		};
	}
}

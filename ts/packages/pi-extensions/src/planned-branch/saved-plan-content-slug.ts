import { formatOutputSection } from "../command-runtime.ts";
import { deriveSlugWithModel, type SlugModelEvidence } from "../model-slug.ts";
import { validatePlanSlug, type PlanCommandExecApi } from "@asdl/planned-branch";
import { normalizePlanContentSlugOutput, truncatePlanContentForSlug } from "./plan-content-slug.ts";

const MAX_ERROR_CHARS = 4_000;

export type SavedPlanContentSlugEvidence = SlugModelEvidence;

export async function deriveSavedPlanContentSlug(
	pi: PlanCommandExecApi,
	input: { content: string; cwd: string; signal?: AbortSignal | undefined },
): Promise<SavedPlanContentSlugEvidence> {
	const prompt = buildSavedPlanContentSlugPrompt(input.content);
	const result = await deriveSlugWithModel({
		cwd: input.cwd,
		prompt,
		...(input.signal === undefined ? {} : { signal: input.signal }),
		slugKind: "saved-plan filename slug",
		normalizeOutput: normalizePlanContentSlugOutput,
		exec: (command, args, options) => pi.exec(command, args, options),
	});
	if (!result.ok) {
		throw slugDerivationFailed(result.failure.lines);
	}

	const { slug, rawOutput } = result.evidence;
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw slugDerivationFailed([
			"Pi slug model output normalized to an invalid saved-plan filename slug.",
			`Normalized slug: ${slug}`,
			`Reason: ${slugError}`,
			formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		]);
	}

	return result.evidence;
}

export function buildSavedPlanContentSlugPrompt(content: string): string {
	return [
		"Generate the saved-plan filename slug for the Markdown implementation plan content below.",
		"Use only the final plan content. Do not use the current branch, repository name, request text, filename, or path.",
		"Return exactly one slug and no prose.",
		"Rules:",
		"- Use lowercase ASCII kebab-case words separated by single hyphens.",
		"- Use 3–7 words.",
		"- Make the slug specific to the implementation described by the plan.",
		"- Prefer concrete deliverables and nouns from the plan body.",
		"- Do not use dates, random IDs, generic-only slugs, or the saved-plan filename.",
		"",
		"## Plan content",
		truncatePlanContentForSlug(content.trim() || "(empty plan content)"),
	].join("\n");
}

function slugDerivationFailed(lines: string[]): Error {
	return new Error(
		[
			"Failed to derive saved-plan filename slug from plan content.",
			...lines,
			"No assistant-generated slug or deterministic fallback was attempted.",
		].join("\n"),
	);
}

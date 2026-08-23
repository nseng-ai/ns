import {
	deriveContentSlug,
	type ContentSlugEvidence,
	type ContentSlugPolicy,
} from "@nseng-ai/extension-kit/content-slug";
import { normalizeBranchSlugText } from "@nseng-ai/foundation/branch-slug";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { createNodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { MAX_PLAN_SLUG_WORDS, MIN_PLAN_SLUG_WORDS, validatePlanSlug } from "./plan-persistence.ts";

export const MAX_PLAN_CONTENT_CHARS = 32_000;

export interface PlanContentSlugVariantSeed {
	slugKind: string;
	promptIntroLines: readonly string[];
	invalidSlugMessage: string;
	failureHeader: string;
	noFallbackLine: string;
}

export interface DeriveContentSlugInput {
	content: string;
	cwd: string;
	signal?: AbortSignal;
}

export type { ContentSlugEvidence };

export async function deriveLegacyContentSlug(
	pi: CommandExecApi,
	input: DeriveContentSlugInput,
	variant: PlanContentSlugVariantSeed,
): Promise<ContentSlugEvidence> {
	const result = await deriveContentSlug(
		{
			commands: pi,
			git: new RealGitGateway(pi),
			projectConfig: createNodeProjectConfigGateway(),
		},
		input,
		toKitContentSlugVariant(variant),
	);
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

export function buildContentSlugPrompt(
	content: string,
	variant: PlanContentSlugVariantSeed,
): string {
	const policy = toKitContentSlugVariant(variant);
	return [
		...policy.promptIntroLines,
		"Return exactly one slug and no prose.",
		"Rules:",
		...policy.promptRuleLines,
		"",
		policy.contentHeading,
		truncateContentForSlug(content.trim() || policy.emptyContentPlaceholder, policy),
	].join("\n");
}

const PLAN_CONTENT_SLUG_NORMALIZATION = {
	maxWords: MAX_PLAN_SLUG_WORDS,
	stripSuffixes: ["-plan"],
} satisfies ContentSlugPolicy["normalization"];

const PLAN_CONTENT_SLUG_TRUNCATION = {
	maxContentChars: MAX_PLAN_CONTENT_CHARS,
	truncationMessage: "[Plan content truncated for slug generation]",
} satisfies Pick<ContentSlugPolicy, "maxContentChars" | "truncationMessage">;

export function normalizePlanContentSlugOutput(value: string): string | undefined {
	return normalizeContentSlugOutput(value, PLAN_CONTENT_SLUG_NORMALIZATION);
}

export function truncatePlanContentForSlug(content: string): string {
	return truncateContentForSlug(content, PLAN_CONTENT_SLUG_TRUNCATION);
}

function toKitContentSlugVariant(variant: PlanContentSlugVariantSeed): ContentSlugPolicy {
	return {
		...variant,
		promptRuleLines: [
			"- Use lowercase ASCII kebab-case words separated by single hyphens.",
			`- Use ${MIN_PLAN_SLUG_WORDS}–${MAX_PLAN_SLUG_WORDS} words.`,
			"- Make the slug specific to the implementation described by the plan.",
			"- Prefer concrete deliverables and nouns from the plan body.",
			"- Do not use dates, random IDs, generic-only slugs, or the saved-plan filename.",
		],
		contentHeading: "## Plan content",
		emptyContentPlaceholder: "(empty plan content)",
		...PLAN_CONTENT_SLUG_TRUNCATION,
		normalization: PLAN_CONTENT_SLUG_NORMALIZATION,
		validateSlug: validatePlanSlug,
	};
}

function normalizeContentSlugOutput(
	value: string,
	options: ContentSlugPolicy["normalization"],
): string | undefined {
	const firstLine = value
		.replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z]*\n?|```/g, ""))
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (firstLine === undefined) return undefined;
	let slug = normalizeBranchSlugText(firstLine);
	for (const suffix of options.stripSuffixes ?? []) {
		while (slug.endsWith(suffix)) {
			const candidate = slug.slice(0, -suffix.length).replace(/^-|-$/g, "");
			if (candidate.length === 0) break;
			slug = candidate;
		}
	}
	const repaired = slug.split("-").filter(Boolean).slice(0, options.maxWords).join("-");
	return repaired.length > 0 ? repaired : undefined;
}

function truncateContentForSlug(
	content: string,
	policy: Pick<ContentSlugPolicy, "maxContentChars" | "truncationMessage">,
): string {
	if (content.length <= policy.maxContentChars) return content;
	return `${content.slice(0, policy.maxContentChars)}\n\n${policy.truncationMessage}`;
}

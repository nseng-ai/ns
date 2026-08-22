import {
	deriveContentSlug,
	type ContentSlugEvidence,
	type ContentSlugPolicy,
	type ContentSlugContext,
	type DeriveContentSlugInput,
} from "@nseng-ai/extension-kit/content-slug";

import { parseFlatHandoffSlug } from "./identity.ts";

const MAX_HANDOFF_SLUG_WORDS = 8;
const GENERIC_ONLY_WORDS = new Set([
	"handoff",
	"artifact",
	"session",
	"continue",
	"follow",
	"up",
	"work",
	"task",
]);

const MAX_HANDOFF_CONTENT_CHARS = 32_000;
export type HandoffContentSlugEvidence = ContentSlugEvidence;

const HANDOFF_CONTENT_SLUG_POLICY = {
	slugKind: "handoff artifact slug",
	promptIntroLines: [
		"Generate the handoff artifact entry slug for the final Markdown handoff content below.",
		"Use only the final Markdown handoff content.",
		"Do not use the original request/focus, current branch, filename, path, dates, random IDs, or generic-only names.",
	],
	promptRuleLines: [
		"- Use lowercase ASCII kebab-case words separated by single hyphens.",
		"- Prefer a concise 3–8 word slug.",
		"- Prefer the concrete future continuation action and subject from the artifact body.",
		"- Avoid raw request preambles such as i-want-to-handoff or please-create-a-handoff.",
		"- Avoid generic-only slugs such as handoff, session, continue, follow-up, work, task, or combinations made only of those words.",
	],
	contentHeading: "## Final Markdown handoff content",
	emptyContentPlaceholder: "(empty handoff content)",
	maxContentChars: MAX_HANDOFF_CONTENT_CHARS,
	truncationMessage: "[Handoff content truncated for slug generation]",
	invalidSlugMessage: "Slug model output normalized to an invalid handoff artifact slug.",
	failureHeader: "Failed to derive handoff slug from final artifact content.",
	noFallbackLine: "No continuation-focus or deterministic fallback was attempted.",
	normalization: {
		maxWords: MAX_HANDOFF_SLUG_WORDS,
		stripSuffixes: ["-handoff-artifact", "-handoff", "-session"],
	},
	validateSlug: validateHandoffContentSlug,
} satisfies ContentSlugPolicy;

export async function deriveHandoffContentSlug(
	context: ContentSlugContext,
	input: DeriveContentSlugInput,
): Promise<HandoffContentSlugEvidence> {
	return deriveContentSlug(context, input, HANDOFF_CONTENT_SLUG_POLICY);
}

function validateHandoffContentSlug(slug: string): string | undefined {
	const parsedSlug = parseFlatHandoffSlug(slug, "handoff artifact slug");
	if (parsedSlug.type === "invalid") return parsedSlug.message;

	const words = parsedSlug.slug.split("-").filter(Boolean);
	if (words.length > 0 && words.every((word) => GENERIC_ONLY_WORDS.has(word))) {
		return "handoff artifact slug must include a specific continuation action or subject, not only generic handoff words.";
	}
	return undefined;
}

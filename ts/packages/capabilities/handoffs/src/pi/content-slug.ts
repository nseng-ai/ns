import {
	buildKitContentSlugPrompt,
	deriveKitContentSlug,
	normalizeContentSlugOutput,
	truncateContentForSlug,
	type ContentSlugDerivationVariant,
	type ContentSlugEvidence,
} from "@nseng-ai/capability-kit/content-slug";
import { parseFlatHandoffSlug } from "../api/index.ts";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import {
	MODEL_OPERATION_IDS,
	loadModelPolicy,
	resolveModelOperation,
} from "@nseng-ai/capability-kit/model-policy";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

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

export const MAX_HANDOFF_CONTENT_CHARS = 32_000;
export type HandoffContentSlugEvidence = ContentSlugEvidence;

const HANDOFF_CONTENT_SLUG_VARIANT: ContentSlugDerivationVariant = {
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
	invalidSlugMessage: "Pi slug model output normalized to an invalid handoff artifact slug.",
	failureHeader: "Failed to derive handoff slug from final artifact content.",
	noFallbackLine: "No continuation-focus or deterministic fallback was attempted.",
	normalization: {
		maxWords: MAX_HANDOFF_SLUG_WORDS,
		stripSuffixes: ["-handoff-artifact", "-handoff", "-session"],
	},
	validateSlug: validateHandoffContentSlug,
};

export async function deriveHandoffContentSlug(
	commands: CommandExecApi,
	input: { content: string; cwd: string; signal?: AbortSignal },
): Promise<HandoffContentSlugEvidence> {
	const repository = await new RealGitGateway(commands).optionalRepoRoot({ cwd: input.cwd });
	if (repository.type !== "found")
		throw new Error("Could not determine the repository root for ns.toml.");
	const policy = loadModelPolicy({ repoRoot: repository.value, gateway: nodeProjectConfigGateway });
	if (!policy.ok) throw new Error(`Invalid model policy in ns.toml: ${policy.error.message}`);
	const model = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
	if (!model.ok) throw new Error(`Invalid model policy in ns.toml: ${model.error.message}`);
	return deriveKitContentSlug(
		commands,
		{ ...input, modelSelection: model.value.selection },
		HANDOFF_CONTENT_SLUG_VARIANT,
	);
}

export function buildHandoffContentSlugPrompt(content: string): string {
	return buildKitContentSlugPrompt(content, HANDOFF_CONTENT_SLUG_VARIANT);
}

export function normalizeHandoffContentSlugOutput(value: string): string | undefined {
	return normalizeContentSlugOutput(value, HANDOFF_CONTENT_SLUG_VARIANT.normalization);
}

export function truncateHandoffContentForSlug(content: string): string {
	return truncateContentForSlug(content, HANDOFF_CONTENT_SLUG_VARIANT);
}

export function validateHandoffContentSlug(slug: string): string | undefined {
	const parsedSlug = parseFlatHandoffSlug(slug, "handoff artifact slug");
	if (parsedSlug.type === "invalid") {
		return parsedSlug.message;
	}

	const words = parsedSlug.slug.split("-").filter(Boolean);
	if (words.length > 0 && words.every((word) => GENERIC_ONLY_WORDS.has(word))) {
		return "handoff artifact slug must include a specific continuation action or subject, not only generic handoff words.";
	}

	return undefined;
}

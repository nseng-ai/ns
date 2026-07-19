import {
	buildKitContentSlugPrompt,
	deriveKitContentSlug,
	type ContentSlugExecApi,
	type KitContentSlugDerivationVariant,
} from "@nseng-ai/capability-kit/content-slug";
import {
	finalizeBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	normalizeBranchSlugText,
	sanitizeBranchName,
} from "@nseng-ai/foundation/branch-slug";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import type {
	DispatchContentSlugGateway,
	DispatchContentSlugInput,
} from "../dispatch-client/contracts.ts";

const DISPATCH_CONTENT_SLUG_MAX_WORDS = 7;
const DISPATCH_CONTENT_SLUG_MAX_CONTENT_CHARS = 32_000;
export function normalizeDispatchSlugOverride(value: string): string | undefined {
	return sanitizeBranchName(value);
}

export function buildDispatchContentSlugPrompt(input: DispatchContentSlugInput): string {
	return buildKitContentSlugPrompt(input.content, dispatchContentSlugVariant(input.kind));
}

export function createRealDispatchContentSlugGateway(
	execApi: ContentSlugExecApi,
	modelSelection: ModelSelection,
): DispatchContentSlugGateway {
	return {
		async deriveSemanticSlug(input) {
			try {
				const evidence = await deriveKitContentSlug(
					execApi,
					{ content: input.content, cwd: input.cwd, modelSelection },
					dispatchContentSlugVariant(input.kind),
				);
				const slug = finalizeBranchSlug(normalizeBranchSlugText(evidence.slug));
				if (slug === undefined) {
					return {
						ok: false,
						error: {
							message: "The semantic slug model returned no usable branch slug.",
						},
					};
				}
				return { ok: true, slug };
			} catch {
				return {
					ok: false,
					error: {
						message:
							"Semantic dispatch slug generation failed without a usable result. Retry or pass --slug/-s with an explicit semantic slug.",
					},
				};
			}
		},
	};
}

function dispatchContentSlugVariant(
	kind: DispatchContentSlugInput["kind"],
): KitContentSlugDerivationVariant {
	const contentLabel = kind === "prompt" ? "prompt" : "plan";
	return {
		slugKind: "dispatch semantic branch slug",
		promptIntroLines: [
			`Generate a semantic branch slug for the actual code or product outcome requested by this ${contentLabel}.`,
			"Name the intended delivered change, not the dispatch mechanism, source branch, document, metadata, or provenance.",
		],
		promptRuleLines: [
			"- Use lowercase ASCII kebab-case words separated by single hyphens.",
			`- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters and no more than ${DISPATCH_CONTENT_SLUG_MAX_WORDS} words.`,
			"- Prefer a concise, verb-led, concrete outcome such as add, fix, rename, remove, migrate, or update.",
			"- Do not mention prompts, plans, dispatch, branches, metadata, dates, or random IDs.",
		],
		contentHeading: `## Dispatched ${contentLabel} content`,
		emptyContentPlaceholder: `(empty ${contentLabel} content)`,
		maxContentChars: DISPATCH_CONTENT_SLUG_MAX_CONTENT_CHARS,
		truncationMessage: `[Dispatched ${contentLabel} content truncated for slug generation]`,
		invalidSlugMessage: "The dispatch slug model output normalized to an unusable semantic slug.",
		failureHeader: "Failed to derive a semantic dispatch branch slug.",
		noFallbackLine:
			"No deterministic fallback was attempted; pass --slug/-s to override generation.",
		normalization: { maxWords: DISPATCH_CONTENT_SLUG_MAX_WORDS },
		validateSlug: () => undefined,
	};
}

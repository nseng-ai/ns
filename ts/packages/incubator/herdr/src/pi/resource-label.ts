import {
	deriveKitContentSlug,
	type ContentSlugDerivationVariant,
} from "@nseng-ai/extension-kit/content-slug";
import {
	MODEL_OPERATION_IDS,
	loadModelPolicy,
	resolveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

import type { HerdrResourceLabelDeriver } from "../core/new-space.ts";
import type { HerdrPiContext } from "./context.ts";

const MAX_RESOURCE_LABEL_WORDS = 6;
const MAX_RESOURCE_DESCRIPTION_CHARS = 8_000;

const RESOURCE_LABEL_VARIANT: ContentSlugDerivationVariant = {
	slugKind: "Herdr resource label",
	promptIntroLines: [
		"Generate a concise semantic label for a new Herdr space or tab from the user's description below.",
		"Name the work or subject the resource is for, not the act of creating it.",
	],
	promptRuleLines: [
		"- Use lowercase ASCII kebab-case words separated by single hyphens.",
		"- Prefer a concise 2–6 word label.",
		"- Use concrete actions and subjects from the description.",
		"- Do not include dates, random IDs, paths, or generic prefixes such as new-space or new-tab.",
	],
	contentHeading: "## Resource description",
	emptyContentPlaceholder: "(empty resource description)",
	maxContentChars: MAX_RESOURCE_DESCRIPTION_CHARS,
	truncationMessage: "[Resource description truncated for label generation]",
	invalidSlugMessage: "Pi slug model output normalized to an invalid Herdr resource label.",
	failureHeader: "Failed to derive a Herdr resource label.",
	noFallbackLine: "No deterministic or assistant-generated fallback label was attempted.",
	normalization: {
		maxWords: MAX_RESOURCE_LABEL_WORDS,
		stripSuffixes: ["-space", "-workspace", "-tab"],
	},
	validateSlug: validateResourceLabel,
};

export function createHerdrResourceLabelDeriver(
	context: Pick<HerdrPiContext, "commands" | "git">,
): HerdrResourceLabelDeriver {
	return {
		async deriveLabel(input) {
			const repository = await context.git.optionalRepoRoot({ cwd: input.cwd });
			if (repository.type !== "found") {
				throw new Error("Could not determine the repository root for ns.toml.");
			}
			const policy = loadModelPolicy({
				repoRoot: repository.value,
				gateway: nodeProjectConfigGateway,
			});
			if (!policy.ok) throw new Error(`Invalid model policy in ns.toml: ${policy.error.message}`);
			const model = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
			if (!model.ok) throw new Error(`Invalid model policy in ns.toml: ${model.error.message}`);
			const evidence = await deriveKitContentSlug(
				context.commands,
				{
					content: input.description,
					cwd: input.cwd,
					modelSelection: model.value.selection,
					...optionalEntry("signal", input.signal),
				},
				RESOURCE_LABEL_VARIANT,
			);
			return evidence.slug;
		},
	};
}

function validateResourceLabel(label: string): string | undefined {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) {
		return "resource label must be flat lowercase ASCII kebab-case";
	}
	return undefined;
}

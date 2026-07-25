import {
	deriveKitContentSlug,
	type ContentSlugDerivationVariant,
} from "@nseng-ai/capability-kit/content-slug";
import {
	MODEL_OPERATION_IDS,
	loadModelPolicy,
	resolveModelOperation,
} from "@nseng-ai/capability-kit/model-policy";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

import type { HerdrSpaceLabelDeriver } from "../core/new-space.ts";
import type { HerdrGitGateway } from "./context.ts";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";

const MAX_SPACE_LABEL_WORDS = 6;
const MAX_SPACE_DESCRIPTION_CHARS = 8_000;

const SPACE_LABEL_VARIANT: ContentSlugDerivationVariant = {
	slugKind: "Herdr space label",
	promptIntroLines: [
		"Generate a concise semantic label for a new Herdr space from the user's description below.",
		"Name the work or subject the space is for, not the act of creating a space.",
	],
	promptRuleLines: [
		"- Use lowercase ASCII kebab-case words separated by single hyphens.",
		"- Prefer a concise 2–6 word label.",
		"- Use concrete actions and subjects from the description.",
		"- Do not include dates, random IDs, paths, or generic prefixes such as new-space.",
	],
	contentHeading: "## Space description",
	emptyContentPlaceholder: "(empty space description)",
	maxContentChars: MAX_SPACE_DESCRIPTION_CHARS,
	truncationMessage: "[Space description truncated for label generation]",
	invalidSlugMessage: "Pi slug model output normalized to an invalid Herdr space label.",
	failureHeader: "Failed to derive a Herdr space label.",
	noFallbackLine: "No deterministic or assistant-generated fallback label was attempted.",
	normalization: { maxWords: MAX_SPACE_LABEL_WORDS, stripSuffixes: ["-space", "-workspace"] },
	validateSlug: validateSpaceLabel,
};

export function createHerdrSpaceLabelDeriver(dependencies: {
	commands: HerdrPiCommandApi;
	git: HerdrGitGateway;
}): HerdrSpaceLabelDeriver {
	return {
		async deriveLabel(input) {
			const repository = await dependencies.git.optionalRepoRoot({ cwd: input.cwd });
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
				dependencies.commands,
				{
					content: input.description,
					cwd: input.cwd,
					modelSelection: model.value.selection,
					...optionalEntry("signal", input.signal),
				},
				SPACE_LABEL_VARIANT,
			);
			return evidence.slug;
		},
	};
}

function validateSpaceLabel(label: string): string | undefined {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) {
		return "space label must be flat lowercase ASCII kebab-case";
	}
	return undefined;
}

import type { ContentSlugPolicy } from "@nseng-ai/extension-kit/content-slug";
import { parseManagedSlotWorktreeRoot } from "@nseng-ai/slots/api";

const MAX_HERDR_RESOURCE_LABEL_WORDS = 6;

export const HERDR_RESOURCE_LABEL_POLICY = {
	slugKind: "Herdr resource label",
	promptIntroLines: [
		"Generate a concise semantic label for the Herdr space or tab from the description or goal below.",
		"Name the work or subject, not the act of creating or renaming the resource.",
	],
	promptRuleLines: [
		"- Use lowercase ASCII kebab-case words separated by single hyphens.",
		"- Prefer a concise 2–6 word label.",
		"- Use concrete actions and subjects from the input.",
		"- Do not include dates, random IDs, paths, or generic prefixes such as new-space or new-tab.",
	],
	contentHeading: "## Resource description or goal",
	emptyContentPlaceholder: "(empty resource description or goal)",
	maxContentChars: 8_000,
	truncationMessage: "[Resource description or goal truncated for label generation]",
	invalidSlugMessage: "Pi slug model output normalized to an invalid Herdr resource label.",
	failureHeader: "Failed to derive a Herdr resource label.",
	noFallbackLine: "No deterministic or assistant-generated fallback label was attempted.",
	normalization: {
		maxWords: MAX_HERDR_RESOURCE_LABEL_WORDS,
		stripSuffixes: ["-workspace", "-space", "-tab"],
	},
	validateSlug: validateHerdrResourceLabel,
} as const satisfies ContentSlugPolicy;

function validateHerdrResourceLabel(label: string): string | undefined {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) {
		return "resource label must be flat lowercase ASCII kebab-case";
	}
	if (label.split("-").length > MAX_HERDR_RESOURCE_LABEL_WORDS) {
		return `resource label must contain at most ${MAX_HERDR_RESOURCE_LABEL_WORDS} words`;
	}
	return undefined;
}

export function compactSlotSlug(slotSlug: string): string {
	const match = /^slot-(\d+)$/.exec(slotSlug);
	if (match === null) return slotSlug;
	return `s${Number(match[1])}`;
}

export interface HerdrResourceLabelInput {
	semanticLabel: string;
	slotSlug?: string;
}

export type HerdrSlotLabelInput = { slotSlug: string } | Record<string, never>;

export function formatHerdrResourceLabel(input: HerdrResourceLabelInput): string {
	if (input.slotSlug === undefined) return input.semanticLabel;
	return `${compactSlotSlug(input.slotSlug)}:${input.semanticLabel}`;
}

export function slotLabelInputFromWorktreeRoot(worktreeRoot: string): HerdrSlotLabelInput {
	const slotSlug = parseManagedSlotWorktreeRoot(worktreeRoot);
	return slotSlug.ok ? { slotSlug: slotSlug.value } : {};
}

import { objectivePublicationSlugPattern } from "./contracts.ts";

/** Objectives-owned Text-content Point for accepted autorun PR titles (ADR 0052). */
export const OBJECTIVE_AUTORUN_PR_TITLE_POINT_ID = "objective.autorun.pr-title";
export const OBJECTIVE_AUTORUN_PR_TITLE_TEXT_CONTENT_ENV_VAR =
	"NS_OBJECTIVE_AUTORUN_PR_TITLE_TEXT_CONTENT";
export const OBJECTIVE_AUTORUN_PR_TITLE_MAX_CHARACTERS = 120;

const templatePlaceholderNames = ["objectiveSlug", "autorunOrdinal", "existingTitle"] as const;
type TemplatePlaceholderName = (typeof templatePlaceholderNames)[number];

/**
 * One canonical `[obj:<slug>] [autorun:<positive-integer>] ` prefix. Stripping
 * exactly one such prefix before rendering keeps retitling idempotent and
 * replaces a stale Objective/ordinal prefix instead of stacking a second one.
 */
const canonicalPrefixPattern = /^\[obj:[a-z0-9]+(?:-[a-z0-9]+)*\] \[autorun:[1-9][0-9]*\] /u;

export type ObjectiveAutorunPrTitleRefusalCode =
	| "invalid-objective-slug"
	| "invalid-autorun-ordinal"
	| "invalid-existing-title"
	| "invalid-template"
	| "invalid-rendered-title";

export interface FormatObjectiveAutorunPrTitleInput {
	template: string;
	objectiveSlug: string;
	autorunOrdinal: number;
	existingTitle: string;
}

export type FormatObjectiveAutorunPrTitleResult =
	| {
			type: "resolved";
			title: string;
			normalizedExistingTitle: string;
			isCanonicalPrefixStripped: boolean;
	  }
	| { type: "refused"; code: ObjectiveAutorunPrTitleRefusalCode; message: string };

/**
 * Pure deterministic autorun PR title rendering. Validates the Objective slug,
 * accepted ordinal, existing title, and the three-placeholder template grammar,
 * then substitutes exact values. Never touches the filesystem, Git, or GitHub.
 */
export function formatObjectiveAutorunPrTitle(
	input: FormatObjectiveAutorunPrTitleInput,
): FormatObjectiveAutorunPrTitleResult {
	if (!objectivePublicationSlugPattern.test(input.objectiveSlug)) {
		return refused(
			"invalid-objective-slug",
			`Objective slug ${JSON.stringify(input.objectiveSlug)} is not a valid Objective slug.`,
		);
	}
	if (!Number.isInteger(input.autorunOrdinal) || input.autorunOrdinal < 1) {
		return refused(
			"invalid-autorun-ordinal",
			`Accepted autorun ordinal must be a positive integer, got ${String(input.autorunOrdinal)}.`,
		);
	}
	const existingTitle = input.existingTitle.trim();
	if (existingTitle.length === 0 || existingTitle.includes("\n")) {
		return refused("invalid-existing-title", "The existing PR title must be one non-empty line.");
	}
	const normalizedExistingTitle = existingTitle.replace(canonicalPrefixPattern, "");
	const isCanonicalPrefixStripped = normalizedExistingTitle !== existingTitle;
	if (normalizedExistingTitle.length === 0) {
		return refused(
			"invalid-existing-title",
			"The existing PR title is empty after removing its canonical autorun prefix.",
		);
	}

	const template = parseTemplate(input.template);
	if (!template.ok) return refused("invalid-template", template.message);

	const title = renderTemplate(template.segments, {
		objectiveSlug: input.objectiveSlug,
		autorunOrdinal: String(input.autorunOrdinal),
		existingTitle: normalizedExistingTitle,
	});
	if (title.length === 0) {
		return refused("invalid-rendered-title", "The rendered title is empty.");
	}
	if (title.includes("\n")) {
		return refused("invalid-rendered-title", "The rendered title contains a newline.");
	}
	if (title.length > OBJECTIVE_AUTORUN_PR_TITLE_MAX_CHARACTERS) {
		return refused(
			"invalid-rendered-title",
			`The rendered title is ${title.length} characters; the maximum is ${OBJECTIVE_AUTORUN_PR_TITLE_MAX_CHARACTERS}. Refusing to truncate.`,
		);
	}
	return { type: "resolved", title, normalizedExistingTitle, isCanonicalPrefixStripped };
}

type TemplateSegment =
	| { kind: "text"; text: string }
	| { kind: "placeholder"; name: TemplatePlaceholderName };

type ParsedTemplate =
	| { ok: true; segments: readonly TemplateSegment[] }
	| { ok: false; message: string };

function parseTemplate(template: string): ParsedTemplate {
	const segments: TemplateSegment[] = [];
	const counts = new Map<TemplatePlaceholderName, number>();
	const tokenPattern = /\{\{([^{}]*)\}\}/gu;
	let lastIndex = 0;
	let plainText = "";
	for (const match of template.matchAll(tokenPattern)) {
		const name = match[1] ?? "";
		if (!isTemplatePlaceholderName(name)) {
			return {
				ok: false,
				message: `The template contains an unknown placeholder {{${name}}}. Allowed placeholders: ${templatePlaceholderNames.map((allowed) => `{{${allowed}}}`).join(", ")}.`,
			};
		}
		counts.set(name, (counts.get(name) ?? 0) + 1);
		const text = template.slice(lastIndex, match.index);
		plainText += text;
		if (text.length > 0) segments.push({ kind: "text", text });
		segments.push({ kind: "placeholder", name });
		lastIndex = match.index + match[0].length;
	}
	const trailing = template.slice(lastIndex);
	plainText += trailing;
	if (trailing.length > 0) segments.push({ kind: "text", text: trailing });
	if (plainText.includes("{{") || plainText.includes("}}")) {
		return { ok: false, message: "The template contains a malformed {{...}} token." };
	}
	for (const name of templatePlaceholderNames) {
		const count = counts.get(name) ?? 0;
		if (count !== 1) {
			return {
				ok: false,
				message: `The template must use {{${name}}} exactly once; found ${count}.`,
			};
		}
	}
	return { ok: true, segments };
}

function renderTemplate(
	segments: readonly TemplateSegment[],
	values: Record<TemplatePlaceholderName, string>,
): string {
	return segments
		.map((segment) => (segment.kind === "text" ? segment.text : values[segment.name]))
		.join("");
}

function isTemplatePlaceholderName(name: string): name is TemplatePlaceholderName {
	return (templatePlaceholderNames as readonly string[]).includes(name);
}

function refused(
	code: ObjectiveAutorunPrTitleRefusalCode,
	message: string,
): FormatObjectiveAutorunPrTitleResult {
	return { type: "refused", code, message };
}

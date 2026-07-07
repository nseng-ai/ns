import type { ReviewDefinition } from "./models.ts";
import { reviewDisplayRole, type ReviewDisplayRole } from "./review-display.ts";

export interface ReviewSkillEntry {
	readonly surface: string;
	readonly label: string;
}

const ACRONYMS = new Map([
	["dry", "DRY"],
	["python", "Python"],
	["ns", "NS"],
	["typescript", "TypeScript"],
]);

const REVIEW_SKILL_ROLE_TEXT = {
	tripwire: {
		labelPrefix: "Tripwire",
	},
	deep_review: {
		labelPrefix: "Review",
	},
} as const satisfies Record<ReviewDisplayRole, { readonly labelPrefix: string }>;

function reviewSkillSurfaceForDefinition(key: string, role: ReviewDisplayRole): string {
	if (role === "tripwire" && key.endsWith("-tripwire")) return `skill:${key}`;
	return `skill:review-${key}`;
}

function reviewSkillTitleForDefinition(key: string, role: ReviewDisplayRole): string {
	const titleKey =
		role === "tripwire" && key.endsWith("-tripwire") ? key.slice(0, -"-tripwire".length) : key;
	const words = titleKey.split(/[/-]/u).filter((word) => word.length > 0);
	return words.map((word, index) => humanizeKeyWord(word, index)).join(" ");
}

function reviewSkillLabel(title: string, role: ReviewDisplayRole): string {
	return `${REVIEW_SKILL_ROLE_TEXT[role].labelPrefix}: ${title}`;
}

export function reviewSkillEntryFromDefinition(
	key: string,
	definition: ReviewDefinition,
): ReviewSkillEntry {
	const role = reviewDisplayRole(definition.modelProfile);
	const title = reviewSkillTitleForDefinition(key, role);
	return {
		surface: reviewSkillSurfaceForDefinition(key, role),
		label: reviewSkillLabel(title, role),
	};
}

function humanizeKeyWord(word: string, index: number): string {
	const lower = word.toLowerCase();
	const acronym = ACRONYMS.get(lower);
	if (acronym !== undefined) return acronym;
	if (index === 0) return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
	return lower;
}

export type RoastSkillEntry = RoastSkillBackedEntry | RoastReviewDefinitionEntry;

interface BaseRoastEntry {
	readonly surface: string;
	readonly title: string;
	readonly description: string;
	readonly defaultPrompt: string;
}

export interface RoastSkillBackedEntry extends BaseRoastEntry {
	readonly backing: "skill";
	readonly skillName: string;
}

export interface RoastReviewDefinitionEntry extends BaseRoastEntry {
	readonly backing: "review-definition";
	readonly reviewKey: string;
	readonly reviewPath: string;
}

const ROAST_SKILL_ENTRIES = [
	{
		backing: "skill",
		surface: "roast:thermonuclear-review",
		skillName: "thermo-nuclear-code-quality-review",
		// Intentionally matches the MVP's named user-facing label: "Roast: ThermonuclearReview".
		title: "ThermonuclearReview",
		description:
			"Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth.",
		defaultPrompt: "Run the ThermonuclearReview roast against the current branch changes.",
	},
	{
		backing: "skill",
		surface: "roast:improve-codebase-architecture",
		skillName: "improve-codebase-architecture",
		title: "Improve codebase architecture",
		description:
			"Scan the codebase for architecture deepening opportunities and present an HTML report.",
		defaultPrompt: "Run the Improve codebase architecture roast for the current repository.",
	},
	{
		backing: "review-definition",
		surface: "roast:asdl-typescript-style",
		reviewKey: "asdl-typescript-style",
		reviewPath: "reviews/asdl-typescript-style.md",
		title: "ASDL TypeScript style",
		description: "Enforce asdl's TypeScript style guide and asdl-tools TypeScript overlay.",
		defaultPrompt: "Run the ASDL TypeScript style roast against the current branch changes.",
	},
	{
		backing: "review-definition",
		surface: "roast:dignified-python",
		reviewKey: "dignified-python",
		reviewPath: "reviews/dignified-python.md",
		title: "Dignified Python",
		description: "Enforce asdl's dignified Python coding standards on the supplied diff.",
		defaultPrompt: "Run the Dignified Python roast against the current branch changes.",
	},
	{
		backing: "review-definition",
		surface: "roast:dry-but-not-too-dry",
		reviewKey: "dry-but-not-too-dry",
		reviewPath: "reviews/dry-but-not-too-dry.md",
		title: "DRY but not too DRY",
		description: "Review duplicated code and structure for consolidation with a high DRY bar.",
		defaultPrompt: "Run the DRY but not too DRY roast against the current branch changes.",
	},
	{
		backing: "review-definition",
		surface: "roast:duplicative-abstractions",
		reviewKey: "duplicative-abstractions",
		reviewPath: "reviews/duplicative-abstractions.md",
		title: "Duplicative abstractions",
		description: "Scout for hand-rolled infrastructure that may duplicate existing helpers.",
		defaultPrompt: "Run the Duplicative abstractions roast against the current branch changes.",
	},
] as const satisfies readonly RoastSkillEntry[];

export function listRoastSkillEntries(): readonly RoastSkillEntry[] {
	return ROAST_SKILL_ENTRIES;
}

export function roastSkillLabel(entry: RoastSkillEntry): string {
	return `Roast: ${entry.title}`;
}

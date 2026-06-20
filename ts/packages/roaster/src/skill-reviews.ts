export interface RoastSkillEntry {
	readonly surface: string;
	readonly reviewKey: string;
	readonly reviewPath: string;
	readonly title: string;
	readonly description: string;
	readonly defaultPrompt: string;
}

const ROAST_SKILL_ENTRIES = [
	{
		surface: "roast:thermonuclear-review",
		reviewKey: "thermonuclear-review",
		reviewPath: "reviews/thermonuclear-review.md",
		// Intentionally matches the MVP's named user-facing label: "Roast: ThermonuclearReview".
		title: "ThermonuclearReview",
		description:
			"Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth.",
		defaultPrompt: "Run the ThermonuclearReview roast against the current branch changes.",
	},
	{
		surface: "roast:improve-codebase-architecture",
		reviewKey: "improve-codebase-architecture",
		reviewPath: "reviews/improve-codebase-architecture.md",
		title: "Improve codebase architecture",
		description:
			"Review the current branch for architecture deepening opportunities grounded in the supplied diff.",
		defaultPrompt:
			"Run the Improve codebase architecture roast against the current branch changes.",
	},
	{
		surface: "roast:asdl-typescript-style",
		reviewKey: "asdl-typescript-style",
		reviewPath: "reviews/asdl-typescript-style.md",
		title: "ASDL TypeScript style",
		description: "Enforce asdl's TypeScript style guide and asdl-tools TypeScript overlay.",
		defaultPrompt: "Run the ASDL TypeScript style roast against the current branch changes.",
	},
	{
		surface: "roast:dignified-python",
		reviewKey: "dignified-python",
		reviewPath: "reviews/dignified-python.md",
		title: "Dignified Python",
		description: "Enforce asdl's dignified Python coding standards on the supplied diff.",
		defaultPrompt: "Run the Dignified Python roast against the current branch changes.",
	},
	{
		surface: "roast:dry-but-not-too-dry",
		reviewKey: "dry-but-not-too-dry",
		reviewPath: "reviews/dry-but-not-too-dry.md",
		title: "DRY but not too DRY",
		description: "Review duplicated code and structure for consolidation with a high DRY bar.",
		defaultPrompt: "Run the DRY but not too DRY roast against the current branch changes.",
	},
	{
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

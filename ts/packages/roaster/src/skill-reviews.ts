export interface RoastSkillEntry {
	readonly surface: string;
	readonly skillName: string;
	readonly title: string;
	readonly description: string;
	readonly defaultPrompt: string;
}

const ROAST_SKILL_ENTRIES = [
	{
		surface: "roast:thermonuclear-review",
		skillName: "thermo-nuclear-code-quality-review",
		// Intentionally matches the MVP's named user-facing label: "Roast: ThermonuclearReview".
		title: "ThermonuclearReview",
		description:
			"Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth.",
		defaultPrompt: "Run the ThermonuclearReview roast against the current branch changes.",
	},
	{
		surface: "roast:improve-codebase-architecture",
		skillName: "improve-codebase-architecture",
		title: "Improve codebase architecture",
		description:
			"Scan the codebase for architecture deepening opportunities and present an HTML report.",
		defaultPrompt: "Run the Improve codebase architecture roast for the current repository.",
	},
] as const satisfies readonly RoastSkillEntry[];

export function listRoastSkillEntries(): readonly RoastSkillEntry[] {
	return ROAST_SKILL_ENTRIES;
}

export function roastSkillLabel(entry: RoastSkillEntry): string {
	return `Roast: ${entry.title}`;
}

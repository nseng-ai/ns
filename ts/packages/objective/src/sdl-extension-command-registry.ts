interface RepoLocalSdlExtensionCommandRegistryEntry {
	readonly manifestName: string;
	readonly manifestDescription: string;
	readonly manifestEntry: string;
	readonly packageExport: string;
}

export const objectiveSdlExtensionCommands = [
	{
		manifestName: "list",
		manifestDescription: "List Objective records in the current checkout.",
		manifestEntry: "./src/commands/list.ts",
		packageExport: "@sdl/objective/sdl/commands/list",
	},
	{
		manifestName: "check",
		manifestDescription: "Check one Objective record for required files and Markdown headings.",
		manifestEntry: "./src/commands/check.ts",
		packageExport: "@sdl/objective/sdl/commands/check",
	},
	{
		manifestName: "archive",
		manifestDescription: "Archive or unarchive an Objective record by moving its directory.",
		manifestEntry: "./src/commands/archive.ts",
		packageExport: "@sdl/objective/sdl/commands/archive",
	},
	{
		manifestName: "exec-list-candidates",
		manifestDescription: "List active Objective slug candidates for shell and agent autocomplete.",
		manifestEntry: "./src/commands/exec-list-candidates.ts",
		packageExport: "@sdl/objective/sdl/commands/exec-list-candidates",
	},
	{
		manifestName: "exec-load-orientations",
		manifestDescription: "Load active Objective orientation files for agent onboarding.",
		manifestEntry: "./src/commands/exec-load-orientations.ts",
		packageExport: "@sdl/objective/sdl/commands/exec-load-orientations",
	},
	{
		manifestName: "exec-read-objective",
		manifestDescription:
			"Read one Objective record by explicit slug as filesystem facts or raw Markdown.",
		manifestEntry: "./src/commands/exec-read-objective.ts",
		packageExport: "@sdl/objective/sdl/commands/exec-read-objective",
	},
	{
		manifestName: "exec-runner-subagent-usage",
		manifestDescription:
			"Summarize Pi runner subagent JSONL usage telemetry for Objective stack digests.",
		manifestEntry: "./src/commands/exec-runner-subagent-usage.ts",
		packageExport: "@sdl/objective/sdl/commands/exec-runner-subagent-usage",
	},
	{
		manifestName: "exec-tracking-gate",
		manifestDescription: "Collect deterministic Objective tracking gate evidence for one slug.",
		manifestEntry: "./src/commands/exec-tracking-gate.ts",
		packageExport: "@sdl/objective/sdl/commands/exec-tracking-gate",
	},
] as const satisfies readonly RepoLocalSdlExtensionCommandRegistryEntry[];

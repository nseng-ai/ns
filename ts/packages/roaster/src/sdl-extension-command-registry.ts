interface RepoLocalSdlExtensionCommandRegistryEntry {
	readonly manifestName: string;
	readonly manifestPath?: readonly string[];
	readonly manifestDescription: string;
	readonly manifestEntry: string;
	readonly packageExport: string;
}

export const roasterSdlExtensionCommands = [
	{
		manifestName: "review-list",
		manifestPath: ["review", "list"],
		manifestDescription: "List configured Roaster review definitions.",
		manifestEntry: "./src/commands/review-list.ts",
		packageExport: "@sdl/roaster/commands/review-list",
	},
	{
		manifestName: "review-ls",
		manifestPath: ["review", "ls"],
		manifestDescription: "Alias for review list.",
		manifestEntry: "./src/commands/review-ls.ts",
		packageExport: "@sdl/roaster/commands/review-ls",
	},
	{
		manifestName: "review-log",
		manifestPath: ["review", "log"],
		manifestDescription: "List Roaster review logs for this branch.",
		manifestEntry: "./src/commands/review-log.ts",
		packageExport: "@sdl/roaster/commands/review-log",
	},
	{
		manifestName: "review-run",
		manifestPath: ["review", "run"],
		manifestDescription: "Run a configured Roaster review over the current diff.",
		manifestEntry: "./src/commands/review-run.ts",
		packageExport: "@sdl/roaster/commands/review-run",
	},
	{
		manifestName: "exec-record-findings",
		manifestDescription: "Record same-session Roaster findings from stdin.",
		manifestEntry: "./src/commands/exec-record-findings.ts",
		packageExport: "@sdl/roaster/commands/exec-record-findings",
	},
	{
		manifestName: "exec-publish-findings",
		manifestDescription: "Publish Roaster findings to GitHub.",
		manifestEntry: "./src/commands/exec-publish-findings.ts",
		packageExport: "@sdl/roaster/commands/exec-publish-findings",
	},
	{
		manifestName: "roast-list",
		manifestPath: ["roast", "list"],
		manifestDescription: "List Roaster review-skill commands.",
		manifestEntry: "./src/commands/roast-list.ts",
		packageExport: "@sdl/roaster/commands/roast-list",
	},
] as const satisfies readonly RepoLocalSdlExtensionCommandRegistryEntry[];

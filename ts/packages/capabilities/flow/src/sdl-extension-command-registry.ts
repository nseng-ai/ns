interface RepoLocalSdlExtensionCommandRegistryEntry {
	readonly manifestName: string;
	readonly manifestDescription: string;
	readonly manifestEntry: string;
	readonly packageExport: string;
}

export const flowSdlExtensionCommands = [
	{
		manifestName: "changes",
		manifestDescription: "Summarize outstanding worktree changes without committing.",
		manifestEntry: "./src/commands/changes.ts",
		packageExport: "sdl-flow/commands/changes",
	},
	{
		manifestName: "cp",
		manifestDescription: "Create a checkpoint commit for the current diff.",
		manifestEntry: "./src/commands/cp.ts",
		packageExport: "sdl-flow/commands/cp",
	},
	{
		manifestName: "autobranch",
		manifestDescription: "Create a Graphite branch from dirty worktree changes.",
		manifestEntry: "./src/commands/autobranch.ts",
		packageExport: "sdl-flow/commands/autobranch",
	},
	{
		manifestName: "branch-latest-commit",
		manifestDescription: "Move the latest eligible commit to a new Graphite child branch.",
		manifestEntry: "./src/commands/branch-latest-commit.ts",
		packageExport: "sdl-flow/commands/branch-latest-commit",
	},
	{
		manifestName: "autoslot",
		manifestDescription:
			"Create a Graphite branch from current work, then move it into a managed slot worktree.",
		manifestEntry: "./src/commands/autoslot.ts",
		packageExport: "sdl-flow/commands/autoslot",
	},
	{
		manifestName: "submit",
		manifestDescription: "Checkpoint outstanding changes, then submit the current Graphite stack.",
		manifestEntry: "./src/commands/submit.ts",
		packageExport: "sdl-flow/commands/submit",
	},
	{
		manifestName: "regenerate-pr",
		manifestDescription: "Regenerate the current branch PR title and description.",
		manifestEntry: "./src/commands/regenerate-pr.ts",
		packageExport: "sdl-flow/commands/regenerate-pr",
	},
	{
		manifestName: "push",
		manifestDescription: "Push already-committed work on the current branch with git push.",
		manifestEntry: "./src/commands/push.ts",
		packageExport: "sdl-flow/commands/push",
	},
	{
		manifestName: "land",
		manifestDescription: "Land the current PR or Graphite stack into trunk.",
		manifestEntry: "./src/commands/land.ts",
		packageExport: "sdl-flow/commands/land",
	},
	{
		manifestName: "pull-trunk",
		manifestDescription: "Pull the configured Graphite trunk branch without running full gt sync.",
		manifestEntry: "./src/commands/pull-trunk.ts",
		packageExport: "sdl-flow/commands/pull-trunk",
	},
	{
		manifestName: "exec-read-graphite-branch-metadata",
		manifestDescription: "Read Graphite branch metadata for flow internals.",
		manifestEntry: "./src/commands/exec-read-graphite-branch-metadata.ts",
		packageExport: "sdl-flow/commands/exec-read-graphite-branch-metadata",
	},
] as const satisfies readonly RepoLocalSdlExtensionCommandRegistryEntry[];

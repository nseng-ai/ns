interface RepoLocalSdlExtensionCommandRegistryEntry {
	readonly manifestName: string;
	readonly manifestDescription: string;
	readonly manifestEntry: string;
	readonly packageExport: string;
}

export const handoffSdlExtensionCommands = [
	{
		manifestName: "list",
		manifestDescription:
			"List handoffs. Defaults to the current branch. Pass --all to list across active branches or --include-deleted to include deleted local branches.",
		manifestEntry: "./src/commands/list.ts",
		packageExport: "@sdl/handoff/sdl/commands/list",
	},
	{
		manifestName: "delete",
		manifestDescription: "Delete one handoff by exact slug.",
		manifestEntry: "./src/commands/delete.ts",
		packageExport: "@sdl/handoff/sdl/commands/delete",
	},
	{
		manifestName: "gc",
		manifestDescription: "Delete handoffs whose local branch no longer exists.",
		manifestEntry: "./src/commands/gc.ts",
		packageExport: "@sdl/handoff/sdl/commands/gc",
	},
	{
		manifestName: "create",
		manifestDescription:
			"Create one handoff artifact from final Markdown supplied on stdin or with --file.",
		manifestEntry: "./src/commands/create.ts",
		packageExport: "@sdl/handoff/sdl/commands/create",
	},
	{
		manifestName: "pickup",
		manifestDescription: "Read one handoff artifact by exact slug.",
		manifestEntry: "./src/commands/pickup.ts",
		packageExport: "@sdl/handoff/sdl/commands/pickup",
	},
] as const satisfies readonly RepoLocalSdlExtensionCommandRegistryEntry[];

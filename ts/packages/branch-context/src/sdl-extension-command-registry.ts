interface RepoLocalSdlExtensionCommandRegistryEntry {
	readonly manifestPath: readonly string[];
	readonly manifestDescription: string;
	readonly manifestEntry: string;
	readonly packageExport: string;
}

const BRANCH_CONTEXT_EXTENSION_ENTRY = "./src/extension.ts";
const BRANCH_CONTEXT_EXTENSION_EXPORT = "@sdl/branch-context/extension";

export const branchContextSdlExtensionCommands = [
	{
		manifestPath: ["exec", "from-plan"],
		manifestDescription: "Create branch context from a saved plan.",
		manifestEntry: BRANCH_CONTEXT_EXTENSION_ENTRY,
		packageExport: BRANCH_CONTEXT_EXTENSION_EXPORT,
	},
	{
		manifestPath: ["exec", "load"],
		manifestDescription:
			"Load a branch-context entry and render the implementation prompt for agent invocation.",
		manifestEntry: BRANCH_CONTEXT_EXTENSION_ENTRY,
		packageExport: BRANCH_CONTEXT_EXTENSION_EXPORT,
	},
	{
		manifestPath: ["exec", "attach"],
		manifestDescription: "Attach a saved plan or file as branch context.",
		manifestEntry: BRANCH_CONTEXT_EXTENSION_ENTRY,
		packageExport: BRANCH_CONTEXT_EXTENSION_EXPORT,
	},
	{
		manifestPath: ["exec", "list"],
		manifestDescription: "List branch-context entries.",
		manifestEntry: BRANCH_CONTEXT_EXTENSION_ENTRY,
		packageExport: BRANCH_CONTEXT_EXTENSION_EXPORT,
	},
	{
		manifestPath: ["exec", "check"],
		manifestDescription: "Check whether a branch-context entry exists.",
		manifestEntry: BRANCH_CONTEXT_EXTENSION_ENTRY,
		packageExport: BRANCH_CONTEXT_EXTENSION_EXPORT,
	},
	{
		manifestPath: ["exec", "delete"],
		manifestDescription: "Delete a branch-context entry.",
		manifestEntry: BRANCH_CONTEXT_EXTENSION_ENTRY,
		packageExport: BRANCH_CONTEXT_EXTENSION_EXPORT,
	},
] as const satisfies readonly RepoLocalSdlExtensionCommandRegistryEntry[];

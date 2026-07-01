import { defineRepoLocalSdlExtensionDescriptor, type SdlCommand } from "sdl-sdk";

import { branchContextAttachSdlCommand } from "./sdl/commands/attach.ts";
import { branchContextCheckSdlCommand } from "./sdl/commands/check.ts";
import { branchContextDeleteSdlCommand } from "./sdl/commands/delete.ts";
import { branchContextFromPlanSdlCommand } from "./sdl/commands/from-plan.ts";
import { branchContextListSdlCommand } from "./sdl/commands/list.ts";
import { branchContextLoadSdlCommand } from "./sdl/commands/load.ts";

const BRANCH_CONTEXT_EXTENSION_ENTRY = "./src/extension.ts";
const BRANCH_CONTEXT_EXTENSION_EXPORT = "@sdl/branch-context/extension";
const BRANCH_CONTEXT_COMMANDS = [
	branchContextFromPlanSdlCommand,
	branchContextLoadSdlCommand,
	branchContextAttachSdlCommand,
	branchContextListSdlCommand,
	branchContextCheckSdlCommand,
	branchContextDeleteSdlCommand,
] as const satisfies readonly SdlCommand[];

export const branchContextRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "branch-context",
	description: "Create and load branch-scoped implementation context.",
	commands: BRANCH_CONTEXT_COMMANDS.map((command) => ({
		command,
		manifestPath: ["exec", command.name],
		manifestEntry: BRANCH_CONTEXT_EXTENSION_ENTRY,
		packageExport: BRANCH_CONTEXT_EXTENSION_EXPORT,
	})),
});

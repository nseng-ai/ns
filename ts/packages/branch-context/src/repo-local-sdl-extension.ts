import { defineRepoLocalSdlExtensionDescriptor } from "sdl-sdk";

import { branchContextAttachSdlCommand } from "./sdl/commands/attach.ts";
import { branchContextCheckSdlCommand } from "./sdl/commands/check.ts";
import { branchContextDeleteSdlCommand } from "./sdl/commands/delete.ts";
import { branchContextFromPlanSdlCommand } from "./sdl/commands/from-plan.ts";
import { branchContextListSdlCommand } from "./sdl/commands/list.ts";
import { branchContextLoadSdlCommand } from "./sdl/commands/load.ts";

const BRANCH_CONTEXT_COMMANDS = [
	branchContextFromPlanSdlCommand,
	branchContextLoadSdlCommand,
	branchContextAttachSdlCommand,
	branchContextListSdlCommand,
	branchContextCheckSdlCommand,
	branchContextDeleteSdlCommand,
] as const;

export const branchContextRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "branch-context",
	description: "Create and load branch-scoped implementation context.",
	commands: BRANCH_CONTEXT_COMMANDS.map((command) => ({
		command,
		manifestPath: ["exec", command.name],
		manifestEntry: `./src/commands/${command.name}.ts`,
		packageExport: `@sdl/branch-context/sdl/commands/${command.name}`,
	})),
});

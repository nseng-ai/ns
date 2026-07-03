import {
	defineRepoLocalSdlExtensionDescriptor,
	repoLocalSdlCommandDescriptor,
} from "@ji/kernel/sdk";

import { branchContextAttachSdlCommand } from "./commands/attach.ts";
import { branchContextCheckSdlCommand } from "./commands/check.ts";
import { branchContextDeleteSdlCommand } from "./commands/delete.ts";
import { branchContextFromPlanSdlCommand } from "./commands/from-plan.ts";
import { branchContextListSdlCommand } from "./commands/list.ts";
import { branchContextLoadSdlCommand } from "./commands/load.ts";

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
	commands: BRANCH_CONTEXT_COMMANDS.map((command) =>
		repoLocalSdlCommandDescriptor({
			command,
			manifestPath: ["exec", command.name],
			packageExportPrefix: "@ji/branch-context/ji/commands",
		}),
	),
});

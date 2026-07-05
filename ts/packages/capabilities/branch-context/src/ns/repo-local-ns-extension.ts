import { defineRepoLocalNsExtensionDescriptor, repoLocalNsCommandDescriptor } from "@ns/kernel/sdk";

import { branchContextAttachNsCommand } from "./commands/attach.ts";
import { branchContextCheckNsCommand } from "./commands/check.ts";
import { branchContextDeleteNsCommand } from "./commands/delete.ts";
import { branchContextFromPlanNsCommand } from "./commands/from-plan.ts";
import { branchContextListNsCommand } from "./commands/list.ts";
import { branchContextLoadNsCommand } from "./commands/load.ts";

const BRANCH_CONTEXT_COMMANDS = [
	branchContextFromPlanNsCommand,
	branchContextLoadNsCommand,
	branchContextAttachNsCommand,
	branchContextListNsCommand,
	branchContextCheckNsCommand,
	branchContextDeleteNsCommand,
] as const;

export const branchContextRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "branch-context",
	description: "Create and load branch-scoped implementation context.",
	commands: BRANCH_CONTEXT_COMMANDS.map((command) =>
		repoLocalNsCommandDescriptor({
			command,
			manifestPath: ["exec", command.name],
			packageExportPrefix: "@ns/branch-context/ns/commands",
		}),
	),
});

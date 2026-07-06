import {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "@nseng-ai/kernel/sdk";

import { skillsInstallNsCommand } from "./commands/install.ts";
import { skillsListNsCommand } from "./commands/list.ts";
import { skillsPathNsCommand } from "./commands/path.ts";

export const skillsRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "skills",
	description: "List and provision ns-owned skills into assistant harnesses.",
	commands: [skillsListNsCommand, skillsPathNsCommand, skillsInstallNsCommand].map((command) =>
		repoLocalNsCommandDescriptor({
			command,
			packageExportPrefix: "@nseng-ai/harness-artifacts/ns/commands",
		}),
	),
});

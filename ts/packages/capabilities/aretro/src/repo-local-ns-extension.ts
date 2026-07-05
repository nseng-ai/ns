import {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "@nseng-ai/kernel/sdk";

import { aretroExecCollectEvidenceNsCommand } from "./ns/commands/exec-collect-evidence.ts";
import { aretroExecReadEvidenceDetailNsCommand } from "./ns/commands/exec-read-evidence-detail.ts";

export const aretroRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "aretro",
	description: "Collect branch retrospective evidence for agents.",
	commands: [aretroExecCollectEvidenceNsCommand, aretroExecReadEvidenceDetailNsCommand].map(
		(command) =>
			repoLocalNsCommandDescriptor({
				command,
				packageExportPrefix: "@nseng-ai/aretro/ns/commands",
			}),
	),
});

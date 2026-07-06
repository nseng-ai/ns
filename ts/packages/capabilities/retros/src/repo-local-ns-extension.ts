import {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "@nseng-ai/kernel/sdk";

import { retrosExecCollectEvidenceNsCommand } from "./ns/commands/exec-collect-evidence.ts";
import { retrosExecReadEvidenceDetailNsCommand } from "./ns/commands/exec-read-evidence-detail.ts";

export const retrosRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "retro",
	description: "Collect branch retrospective evidence for agents.",
	commands: [retrosExecCollectEvidenceNsCommand, retrosExecReadEvidenceDetailNsCommand].map(
		(command) =>
			repoLocalNsCommandDescriptor({
				command,
				packageExportPrefix: "@nseng-ai/retros/ns/commands",
			}),
	),
});

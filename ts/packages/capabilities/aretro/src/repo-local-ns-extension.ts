import {
	defineRepoLocalSdlExtensionDescriptor,
	repoLocalSdlCommandDescriptor,
} from "@ns/kernel/sdk";

import { aretroExecCollectEvidenceSdlCommand } from "./ns/commands/exec-collect-evidence.ts";
import { aretroExecReadEvidenceDetailSdlCommand } from "./ns/commands/exec-read-evidence-detail.ts";

export const aretroRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "aretro",
	description: "Collect branch retrospective evidence for agents.",
	commands: [aretroExecCollectEvidenceSdlCommand, aretroExecReadEvidenceDetailSdlCommand].map(
		(command) =>
			repoLocalSdlCommandDescriptor({
				command,
				packageExportPrefix: "@ns/aretro/ns/commands",
			}),
	),
});

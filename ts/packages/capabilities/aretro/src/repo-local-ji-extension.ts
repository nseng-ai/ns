import {
	defineRepoLocalSdlExtensionDescriptor,
	repoLocalSdlCommandDescriptor,
} from "@ji/kernel/sdk";

import { aretroExecCollectEvidenceSdlCommand } from "./ji/commands/exec-collect-evidence.ts";
import { aretroExecReadEvidenceDetailSdlCommand } from "./ji/commands/exec-read-evidence-detail.ts";

export const aretroRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "aretro",
	description: "Collect branch retrospective evidence for agents.",
	commands: [aretroExecCollectEvidenceSdlCommand, aretroExecReadEvidenceDetailSdlCommand].map(
		(command) =>
			repoLocalSdlCommandDescriptor({
				command,
				packageExportPrefix: "@ji/aretro/ji/commands",
			}),
	),
});

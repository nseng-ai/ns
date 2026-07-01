import { defineRepoLocalSdlExtensionDescriptor, repoLocalSdlCommandDescriptor } from "sdl-sdk";

import { aretroExecCollectEvidenceSdlCommand } from "./sdl/commands/exec-collect-evidence.ts";
import { aretroExecReadEvidenceDetailSdlCommand } from "./sdl/commands/exec-read-evidence-detail.ts";

export const aretroRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "aretro",
	description: "Collect branch retrospective evidence for agents.",
	commands: [aretroExecCollectEvidenceSdlCommand, aretroExecReadEvidenceDetailSdlCommand].map(
		(command) =>
			repoLocalSdlCommandDescriptor({
				command,
				packageExportPrefix: "@sdl/aretro/sdl/commands",
			}),
	),
});

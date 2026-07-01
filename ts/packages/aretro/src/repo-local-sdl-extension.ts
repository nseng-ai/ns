import { defineRepoLocalSdlExtensionDescriptor } from "sdl-sdk";

import { aretroExecCollectEvidenceSdlCommand } from "./sdl/commands/exec-collect-evidence.ts";
import { aretroExecReadEvidenceDetailSdlCommand } from "./sdl/commands/exec-read-evidence-detail.ts";

export const aretroRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "aretro",
	description: "Collect branch retrospective evidence for agents.",
	commands: [
		{
			command: aretroExecCollectEvidenceSdlCommand,
			manifestEntry: "./src/commands/exec-collect-evidence.ts",
			packageExport: "@sdl/aretro/sdl/commands/exec-collect-evidence",
		},
		{
			command: aretroExecReadEvidenceDetailSdlCommand,
			manifestEntry: "./src/commands/exec-read-evidence-detail.ts",
			packageExport: "@sdl/aretro/sdl/commands/exec-read-evidence-detail",
		},
	],
});

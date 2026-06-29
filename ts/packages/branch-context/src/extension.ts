import { defineExtension } from "sdl-sdk";

import { branchContextAttachSdlCommand } from "./sdl/commands/attach.ts";
import { branchContextCheckSdlCommand } from "./sdl/commands/check.ts";
import { branchContextDeleteSdlCommand } from "./sdl/commands/delete.ts";
import { branchContextFromPlanSdlCommand } from "./sdl/commands/from-plan.ts";
import { branchContextListSdlCommand } from "./sdl/commands/list.ts";
import { branchContextLoadSdlCommand } from "./sdl/commands/load.ts";

export default defineExtension({
	commands: [
		branchContextFromPlanSdlCommand,
		branchContextLoadSdlCommand,
		branchContextAttachSdlCommand,
		branchContextListSdlCommand,
		branchContextCheckSdlCommand,
		branchContextDeleteSdlCommand,
	],
});

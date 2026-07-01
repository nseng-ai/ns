import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecMapBranchPrsSdlCommand = prAddressSdlCommand("map-branch-prs");

export default defineExtension({
	commands: [addressExecMapBranchPrsSdlCommand],
});

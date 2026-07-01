import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecBranchPrSdlCommand = prAddressSdlCommand("branch-pr");

export default defineExtension({
	commands: [addressExecBranchPrSdlCommand],
});

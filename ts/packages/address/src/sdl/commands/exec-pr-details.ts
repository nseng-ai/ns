import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecPrDetailsSdlCommand = prAddressSdlCommand("pr-details");

export default defineExtension({
	commands: [addressExecPrDetailsSdlCommand],
});

import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecPrChecksSdlCommand = prAddressSdlCommand("pr-checks");

export default defineExtension({
	commands: [addressExecPrChecksSdlCommand],
});

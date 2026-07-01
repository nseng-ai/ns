import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecOpenPrsSdlCommand = prAddressSdlCommand("open-prs");

export default defineExtension({
	commands: [addressExecOpenPrsSdlCommand],
});

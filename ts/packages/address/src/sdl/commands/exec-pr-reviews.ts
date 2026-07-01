import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecPrReviewsSdlCommand = prAddressSdlCommand("pr-reviews");

export default defineExtension({
	commands: [addressExecPrReviewsSdlCommand],
});

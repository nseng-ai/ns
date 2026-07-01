import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecPrReviewThreadsSdlCommand = prAddressSdlCommand("pr-review-threads");

export default defineExtension({
	commands: [addressExecPrReviewThreadsSdlCommand],
});

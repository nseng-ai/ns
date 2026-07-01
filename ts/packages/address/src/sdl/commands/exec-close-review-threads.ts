import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecCloseReviewThreadsSdlCommand = prAddressSdlCommand("close-review-threads");

export default defineExtension({
	commands: [addressExecCloseReviewThreadsSdlCommand],
});

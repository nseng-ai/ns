import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecReplyReviewThreadSdlCommand = prAddressSdlCommand("reply-review-thread");

export default defineExtension({
	commands: [addressExecReplyReviewThreadSdlCommand],
});

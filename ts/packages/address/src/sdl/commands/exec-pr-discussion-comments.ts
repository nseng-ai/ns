import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecPrDiscussionCommentsSdlCommand = prAddressSdlCommand("pr-discussion-comments");

export default defineExtension({
	commands: [addressExecPrDiscussionCommentsSdlCommand],
});

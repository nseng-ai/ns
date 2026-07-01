import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecResolveReviewThreadSdlCommand = prAddressSdlCommand("resolve-review-thread");

export default defineExtension({
	commands: [addressExecResolveReviewThreadSdlCommand],
});

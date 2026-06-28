import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../../../../ts/packages/address/src/sdl-command.ts";

export default defineExtension({
	commands: [prAddressSdlCommand("reply-review-thread")],
});

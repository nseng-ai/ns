import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../sdl-command.ts";

const addressExecDownloadFeedbackSdlCommand = prAddressSdlCommand("download-feedback");

export default defineExtension({
	commands: [addressExecDownloadFeedbackSdlCommand],
});

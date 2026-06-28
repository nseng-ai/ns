import { defineExtension } from "sdl-sdk";

import { prAddressSdlCommand } from "../../../../../ts/packages/address/src/sdl-command.ts";

export default defineExtension({
	commands: [
		prAddressSdlCommand("download-feedback"),
		prAddressSdlCommand("map-branch-prs"),
		prAddressSdlCommand("pr-details"),
		prAddressSdlCommand("branch-pr"),
		prAddressSdlCommand("open-prs"),
		prAddressSdlCommand("pr-reviews"),
		prAddressSdlCommand("pr-review-threads"),
		prAddressSdlCommand("pr-discussion-comments"),
		prAddressSdlCommand("pr-checks"),
		prAddressSdlCommand("reply-review-thread"),
		prAddressSdlCommand("resolve-review-thread"),
	],
});

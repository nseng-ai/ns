import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";

import { HERDR_SPACE_NEW_COMMAND_NAME } from "../core/command-surfaces.ts";
import { handleHerdrNewSpace } from "../core/new-space.ts";
import type { HerdrGateway } from "../core/herdr-gateway.ts";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";
import type { HerdrGitGateway } from "./context.ts";
import { createHerdrSpaceLabelDeriver } from "./new-space-label.ts";

export function registerHerdrNewSpaceCommand(dependencies: {
	commands: HerdrPiCommandApi;
	git: HerdrGitGateway;
	herdr: HerdrGateway;
}): void {
	const { commands, herdr } = dependencies;
	const labelDeriver = createHerdrSpaceLabelDeriver(dependencies);

	registerCommandWithImmediateAck({
		host: commands,
		commandName: HERDR_SPACE_NEW_COMMAND_NAME,
		commandDefinition: {
			description: "Open a focused Herdr space at the current cwd.",
			argumentHint: "[description for an LM-derived label]",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: commands, ctx });
				await ctx.waitForIdle();
				await handleHerdrNewSpace({ herdr, labelDeriver, args, ctx, notifyProgress });
			},
		},
		options: { delivery: "message" },
	});
}

import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";

import { HERDR_SPACE_NEW_COMMAND_NAME } from "../core/command-surfaces.ts";
import { handleHerdrNewSpace } from "../core/new-space.ts";
import type { HerdrPiContext } from "./context.ts";
import { createHerdrResourceLabelDeriver } from "./resource-label.ts";

export function registerHerdrNewSpaceCommand(context: HerdrPiContext): void {
	const { commands, herdr } = context;
	const labelDeriver = createHerdrResourceLabelDeriver(context);

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

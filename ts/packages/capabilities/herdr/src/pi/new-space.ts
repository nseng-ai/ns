import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";

import { HERDR_SPACE_NEW_COMMAND_NAME } from "../core/command-surfaces.ts";
import { handleHerdrNewSpace } from "../core/new-space.ts";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import type { HerdrPiContext } from "./context.ts";
import { createHerdrSpaceLabelDeriver } from "./new-space-label.ts";

export function registerHerdrNewSpaceCommand(context: HerdrPiContext): void {
	const { pi } = context;
	const herdr = createCliHerdrGateway(pi);
	const labelDeriver = createHerdrSpaceLabelDeriver(context);

	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_SPACE_NEW_COMMAND_NAME,
		commandDefinition: {
			description: "Open a focused Herdr space at the current cwd.",
			argumentHint: "[description for an LM-derived label]",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await ctx.waitForIdle();
				await handleHerdrNewSpace({ herdr, labelDeriver, args, ctx, notifyProgress });
			},
		},
		options: { delivery: "message" },
	});
}

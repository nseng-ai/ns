import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";

import { HERDR_SPACE_GOAL_COMMAND_NAME } from "../core/command-surfaces.ts";
import { handleHerdrSpaceGoal } from "../core/space-goal.ts";
import type { HerdrPiRegistrationContext } from "./context.ts";
import { createHerdrPiContextAccessor } from "./context.ts";
import { createHerdrSlotsCapabilityProbe } from "./slots-capability.ts";

export function registerHerdrSpaceGoalCommand(context: HerdrPiRegistrationContext): void {
	const { pi, herdr } = context;
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_SPACE_GOAL_COMMAND_NAME,
		commandDefinition: {
			description:
				"Assign a goal to the caller Herdr workspace: an LM derives a slug label and renames the space.",
			argumentHint: "<goal>",
			handler: async (args, ctx) => {
				const getContext = createHerdrPiContextAccessor(context, ctx.cwd);
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrSpaceGoal({
					context: {
						pi,
						herdr,
						hasSlotsCapability: createHerdrSlotsCapabilityProbe(getContext),
					},
					args,
					ctx,
					notifyProgress,
				});
			},
		},
	});
}

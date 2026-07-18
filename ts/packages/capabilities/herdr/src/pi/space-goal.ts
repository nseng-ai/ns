import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";

import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { HERDR_SPACE_GOAL_COMMAND_NAME } from "../core/command-surfaces.ts";
import { handleHerdrSpaceGoal } from "../core/space-goal.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";
import { createHerdrSlotsCapabilityProbe } from "./slots-capability.ts";

export function registerHerdrSpaceGoalCommand(rawPi: ExtensionAPI): void {
	const pi = createHerdrPiCommandApi(rawPi);
	const herdr = createCliHerdrGateway(pi);
	const context = { pi, herdr, hasSlotsCapability: createHerdrSlotsCapabilityProbe(pi) };
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_SPACE_GOAL_COMMAND_NAME,
		commandDefinition: {
			description:
				"Assign a goal to the caller Herdr workspace: an LM derives a slug label and renames the space.",
			argumentHint: "<goal>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrSpaceGoal({ context, args, ctx, notifyProgress });
			},
		},
	});
}

import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";

import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import {
	HERDR_TAB_GOAL_COMMAND_NAME,
	HERDR_TAB_NEW_COMMAND_NAME,
} from "../core/command-surfaces.ts";
import { handleHerdrNewTab, handleHerdrTabGoal } from "../core/tab.ts";
import type { HerdrPiContext } from "./context.ts";
import { createHerdrSpaceLabelDeriver } from "./new-space-label.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

export function registerHerdrNewTabCommand(context: HerdrPiContext): void {
	const herdr = createCliHerdrGateway(context.pi);
	const labelDeriver = createHerdrSpaceLabelDeriver(context);
	registerCommandWithImmediateAck({
		host: context.pi,
		commandName: HERDR_TAB_NEW_COMMAND_NAME,
		commandDefinition: {
			description: "Open a focused Herdr tab in the caller workspace at the current cwd.",
			argumentHint: "[description for an LM-derived label]",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: context.pi, ctx });
				await ctx.waitForIdle();
				await handleHerdrNewTab({ herdr, labelDeriver, args, ctx, notifyProgress });
			},
		},
		options: { delivery: "message" },
	});
}

export function registerHerdrTabGoalCommand(rawPi: ExtensionAPI): void {
	const pi = createHerdrPiCommandApi(rawPi);
	const herdr = createCliHerdrGateway(pi);
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_TAB_GOAL_COMMAND_NAME,
		commandDefinition: {
			description: "Assign a goal-derived label to the exact caller Herdr tab.",
			argumentHint: "<goal>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrTabGoal({ pi, herdr, args, ctx, notifyProgress });
			},
		},
		options: { delivery: "message" },
	});
}

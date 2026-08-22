import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";

import { HERDR_TAB_GOAL_COMMAND_NAME, HERDR_TAB_NEW_COMMAND_NAME } from "@nseng-ai/herdr/api";
import { handleHerdrNewTab, handleHerdrTabGoal } from "../core/tab.ts";
import type { HerdrPiContext } from "./context.ts";
import { createHerdrResourceLabelDeriver } from "./resource-label.ts";

export function registerHerdrNewTabCommand(context: HerdrPiContext): void {
	const { commands, herdr } = context;
	const labelDeriver = createHerdrResourceLabelDeriver(context);
	registerCommandWithImmediateAck({
		host: commands,
		commandName: HERDR_TAB_NEW_COMMAND_NAME,
		commandDefinition: {
			description: "Open a focused Herdr tab in the caller workspace at the current cwd.",
			argumentHint: "[description for an LM-derived label]",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: commands, ctx });
				await ctx.waitForIdle();
				await handleHerdrNewTab({ herdr, labelDeriver, args, ctx, notifyProgress });
			},
		},
		options: { delivery: "message" },
	});
}

export function registerHerdrTabGoalCommand(context: HerdrPiContext): void {
	const pi = context.commands;
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_TAB_GOAL_COMMAND_NAME,
		commandDefinition: {
			description: "Assign a goal-derived label to the exact caller Herdr tab.",
			argumentHint: "<goal>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrTabGoal({
					contentSlug: context,
					herdr: context.herdr,
					args,
					ctx,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

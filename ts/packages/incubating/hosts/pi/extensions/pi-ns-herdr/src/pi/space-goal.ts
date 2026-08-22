import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";
import { HERDR_SPACE_GOAL_COMMAND_NAME } from "@nseng-ai/herdr/api";
import { handleHerdrSpaceGoal } from "../core/space-goal.ts";
import type { HerdrPiContext } from "./context.ts";

export function registerHerdrSpaceGoalCommand(context: HerdrPiContext): void {
	const pi = context.commands;
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_SPACE_GOAL_COMMAND_NAME,
		commandDefinition: {
			description:
				"Assign a goal to the caller Herdr workspace: an LM derives a slug label and renames the space.",
			argumentHint: "<goal>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrSpaceGoal({
					contentSlug: context,
					herdr: context.herdr,
					resolveSlotLabelInput: context.resolveSlotLabelInput,
					args,
					ctx,
					notifyProgress,
				});
			},
		},
	});
}

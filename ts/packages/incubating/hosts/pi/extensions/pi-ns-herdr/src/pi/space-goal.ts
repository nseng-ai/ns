import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";

import { HERDR_SPACE_GOAL_COMMAND_NAME } from "@nseng-ai/herdr/api";
import { generateWorkspaceGoalSlug, handleHerdrSpaceGoal } from "../core/space-goal.ts";
import { resolveHerdrSlugModelSelection } from "../core/model-policy.ts";
import type { HerdrPiContext } from "./context.ts";

export function registerHerdrSpaceGoalCommand(context: HerdrPiContext): void {
	const { commands, herdr } = context;
	registerCommandWithImmediateAck({
		host: commands,
		commandName: HERDR_SPACE_GOAL_COMMAND_NAME,
		commandDefinition: {
			description:
				"Assign a goal to the caller Herdr workspace: an LM derives a slug label and renames the space.",
			argumentHint: "<goal>",
			handler: async (args, ctx) => {
				const callerWorkspace = await herdr.resolveCallerPane();
				if (callerWorkspace.type === "failed") {
					ctx.ui.notify(
						`Not running inside a Herdr caller space.\n${callerWorkspace.message}`,
						"warning",
					);
					return;
				}
				let modelSelection;
				try {
					modelSelection = await resolveHerdrSlugModelSelection(
						context.createProjectConfig({ cwd: ctx.cwd }),
					);
				} catch (error) {
					ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
					return;
				}
				const notifyProgress = makeCommandProgressNotifier({ host: commands, ctx });
				await handleHerdrSpaceGoal({
					herdr,
					workspaceId: callerWorkspace.workspaceId,
					labelDeriver: {
						deriveSlug: ({ cwd, goal }) =>
							generateWorkspaceGoalSlug(commands, cwd, goal, modelSelection),
					},
					...(context.resolveSlotLabelInput === undefined
						? {}
						: { resolveSlotLabelInput: context.resolveSlotLabelInput }),
					args,
					ctx,
					notifyProgress,
				});
			},
		},
	});
}

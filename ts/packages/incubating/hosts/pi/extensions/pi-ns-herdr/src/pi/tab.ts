import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";

import { HERDR_TAB_GOAL_COMMAND_NAME, HERDR_TAB_NEW_COMMAND_NAME } from "@nseng-ai/herdr/api";
import type { HerdrResourceLabelDeriver } from "../core/new-space.ts";
import { handleHerdrNewTab, handleHerdrTabGoal } from "../core/tab.ts";
import { generateWorkspaceGoalSlug } from "../core/space-goal.ts";
import type { HerdrPiContext } from "./context.ts";
import { createHerdrResourceLabelDeriver } from "./resource-label.ts";
import { resolveHerdrSlugModelSelection } from "../core/model-policy.ts";

export function registerHerdrNewTabCommand(context: HerdrPiContext): void {
	const { commands, herdr } = context;
	registerCommandWithImmediateAck({
		host: commands,
		commandName: HERDR_TAB_NEW_COMMAND_NAME,
		commandDefinition: {
			description: "Open a focused Herdr tab in the caller workspace at the current cwd.",
			argumentHint: "[description for an LM-derived label]",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: commands, ctx });
				const callerWorkspace = await herdr.resolveCallerPane();
				if (callerWorkspace.type === "failed") {
					ctx.ui.notify(
						`Not running inside a Herdr caller space.\n${callerWorkspace.message}`,
						"warning",
					);
					return;
				}
				const workspaceId = callerWorkspace.workspaceId;
				await ctx.waitForIdle();
				let labelDeriver: HerdrResourceLabelDeriver | undefined;
				if (args.trim().length > 0) {
					try {
						const modelSelection = await resolveHerdrSlugModelSelection(
							context.createProjectConfig({ cwd: ctx.cwd }),
						);
						labelDeriver = createHerdrResourceLabelDeriver(commands, modelSelection);
					} catch (error) {
						const detail = error instanceof Error ? error.message : String(error);
						ctx.ui.notify(
							`Could not derive a label for the new Herdr tab. No tab was created.\n${detail}`,
							"error",
						);
						return;
					}
				}
				await handleHerdrNewTab({
					herdr,
					workspaceId,
					args,
					ctx,
					notifyProgress,
					...(labelDeriver === undefined ? {} : { labelDeriver }),
				});
			},
		},
		options: { delivery: "message" },
	});
}

export function registerHerdrTabGoalCommand(context: HerdrPiContext): void {
	const pi = context.commands;
	const herdr = context.herdr;
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_TAB_GOAL_COMMAND_NAME,
		commandDefinition: {
			description: "Assign a goal-derived label to the exact caller Herdr tab.",
			argumentHint: "<goal>",
			handler: async (args, ctx) => {
				const callerTab = await herdr.resolveCallerPane();
				if (callerTab.type === "failed") {
					if (ctx.hasUI !== false) {
						ctx.ui.notify(
							`Not running inside a Herdr caller tab.\n${callerTab.message}`,
							"warning",
						);
					}
					return;
				}
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrTabGoal({
					herdr,
					tabId: callerTab.tabId,
					labelDeriver: {
						async deriveSlug({ cwd, goal }) {
							try {
								const modelSelection = await resolveHerdrSlugModelSelection(
									context.createProjectConfig({ cwd }),
								);
								return generateWorkspaceGoalSlug(pi, cwd, goal, modelSelection);
							} catch (error) {
								return {
									ok: false,
									message: error instanceof Error ? error.message : String(error),
								};
							}
						},
					},
					args,
					ctx,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

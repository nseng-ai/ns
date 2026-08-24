import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";

import { HERDR_SPACE_NEW_COMMAND_NAME } from "@nseng-ai/herdr/api";
import { handleHerdrNewSpace, type HerdrResourceLabelDeriver } from "../core/new-space.ts";
import type { HerdrPiContext } from "./context.ts";
import { createHerdrResourceLabelDeriver } from "./resource-label.ts";
import { resolveHerdrSlugModelSelection } from "../core/model-policy.ts";

export function registerHerdrNewSpaceCommand(context: HerdrPiContext): void {
	const { commands, herdr } = context;

	registerCommandWithImmediateAck({
		host: commands,
		commandName: HERDR_SPACE_NEW_COMMAND_NAME,
		commandDefinition: {
			description: "Open a focused Herdr space at the current cwd.",
			argumentHint: "[description for an LM-derived label]",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: commands, ctx });
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
							`Could not derive a label for the new Herdr space. No space was created.\n${detail}`,
							"error",
						);
						return;
					}
				}
				await handleHerdrNewSpace({
					herdr,
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

import { optionalEntry } from "@sdl/core/primitives";
import { makeCommandProgressNotifier, registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
import {
	handleCccSlotDispatchPrompt,
	type DispatchPromptPayloadOptions,
	resolveDispatchPromptPayloadOptions,
} from "@sdl/ccc/api";
import type { ExtensionAPI } from "@sdl/capability-kit/cmux/types";

const COMMAND_NAME = "ccc:workspace:dispatch-prompt";

export function registerCccSlotDispatchPromptCommand(
	pi: ExtensionAPI,
	options: DispatchPromptPayloadOptions = {},
): void {
	const payloadOptions = resolveDispatchPromptPayloadOptions(options);
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Create a Graphite-tracked branch and dispatch a prompt in a new cmux workspace.",
			argumentHint: "<prompt>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleCccSlotDispatchPrompt({
					pi,
					payloadOptions,
					...optionalEntry("slotClient", options.slotClient),
					args,
					ctx,
					notifyProgress,
				});
			},
		},
	});
}

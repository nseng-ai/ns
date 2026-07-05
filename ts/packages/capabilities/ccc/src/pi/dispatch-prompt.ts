import { optionalEntry } from "@ns/core/primitives";
import { makeCommandProgressNotifier, registerCommandWithImmediateAck } from "@ns/pi/commands/ack";
import {
	CCC_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME,
	handleCccSlotDispatchPrompt,
	type DispatchPromptPayloadOptions,
	resolveDispatchPromptPayloadOptions,
} from "../api/handlers.ts";
import type { ExtensionAPI } from "@ns/capability-kit/cmux/types";

const COMMAND_NAME = CCC_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME;

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

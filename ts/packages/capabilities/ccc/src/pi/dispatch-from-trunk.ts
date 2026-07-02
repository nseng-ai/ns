import { optionalEntry } from "@sdl/core/primitives";
import { makeCommandProgressNotifier, registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
import {
	handleCccSlotDispatchFromTrunk,
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
} from "../api/handlers.ts";
import type { ExtensionAPI } from "@sdl/capability-kit/cmux/types";

const COMMAND_NAME = "ccc:workspace:dispatch-from-trunk";

export function registerCccSlotDispatchFromTrunkCommand(
	pi: ExtensionAPI,
	options: DispatchPromptPayloadOptions = {},
): void {
	const payloadOptions = resolveDispatchPromptPayloadOptions(options);
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Create a Graphite-tracked branch from trunk/main and launch it in a new cmux workspace.",
			argumentHint: "<task>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleCccSlotDispatchFromTrunk({
					pi,
					payloadOptions,
					args,
					ctx,
					...optionalEntry("slotClient", options.slotClient),
					notifyProgress,
				});
			},
		},
	});
}

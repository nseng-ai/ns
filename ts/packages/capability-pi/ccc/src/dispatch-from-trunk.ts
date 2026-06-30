import { registerCommandWithImmediateAck, sendCommandProgressOrNotify } from "@sdl/pi/commands/ack";
import {
	handleCccSlotDispatchFromTrunk,
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
} from "@sdl/ccc/api";
import type { ExtensionAPI } from "@sdl/cmux/types";

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
				const notifyProgress = (message: string): void => {
					sendCommandProgressOrNotify({ host: pi, ctx, message });
				};
				await handleCccSlotDispatchFromTrunk({
					pi,
					payloadOptions,
					args,
					ctx,
					...(options.slotClient === undefined ? {} : { slotClient: options.slotClient }),
					notifyProgress,
				});
			},
		},
	});
}

import { makeCommandProgressNotifier, registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
import { handleCccSlotOpenBranch, type CccSlotOpenBranchOptions } from "../api/handlers.ts";
import type { ExtensionAPI } from "@sdl/capability-kit/cmux/types";

const COMMAND_NAME = "ccc:workspace:open-branch";

export function registerCccSlotOpenBranchCommand(
	pi: ExtensionAPI,
	options: CccSlotOpenBranchOptions = {},
): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Open an existing Git branch in a new cmux workspace.",
			argumentHint: "<branch>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleCccSlotOpenBranch({
					pi,
					args,
					ctx,
					options,
					notifyProgress,
				});
			},
		},
	});

	// Note: Autocomplete provider setup moved here from CCC handler
	// to preserve Pi-specific wiring in the adapter
}

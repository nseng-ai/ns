import { makeCommandProgressNotifier, registerCommandWithImmediateAck } from "@ns/pi/commands/ack";
import { handleCccSlotOpenBranch, type CccSlotOpenBranchOptions } from "../api/handlers.ts";
import type { ExtensionAPI } from "@ns/capability-kit/cmux/types";
import { CCC_WORKSPACE_OPEN_BRANCH_COMMAND_NAME } from "./surfaces.ts";

const COMMAND_NAME = CCC_WORKSPACE_OPEN_BRANCH_COMMAND_NAME;

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

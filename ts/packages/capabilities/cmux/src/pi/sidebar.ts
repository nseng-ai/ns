import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import {
	CMUX_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
	createCccSidebarController,
	type CccSidebarController,
} from "../api/handlers.ts";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";
import { createCccPiCommandApi } from "./pi-command-api.ts";

export function registerCccSidebarCommands(
	pi: ExtensionAPI,
	controller: CccSidebarController,
): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: CMUX_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
		commandDefinition: {
			description: "Format Objective overview into the caller cmux sidebar.",
			argumentHint: "<slug or path>",
			handler: async (args, ctx) => controller.handleObjectiveCommand(args, ctx),
		},
	});
}

export function createCccSidebarControllerWithPiWiring(rawPi: ExtensionAPI): CccSidebarController {
	const pi = createCccPiCommandApi(rawPi);
	return createCccSidebarController(pi);
}

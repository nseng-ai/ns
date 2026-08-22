import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/extension-kit/pi-types";

import { HERDR_SPACE_OBJECTIVE_SUMMARY_COMMAND_NAME } from "@nseng-ai/herdr/api";
import type { HerdrSidebarController } from "../core/sidebar.ts";

export function registerHerdrSidebarCommand(
	pi: ExtensionAPI,
	controller: HerdrSidebarController,
): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_SPACE_OBJECTIVE_SUMMARY_COMMAND_NAME,
		commandDefinition: {
			description:
				"Apply an Objective label to the explicit caller Herdr workspace, prefixed with " +
				"the compact slot name when running in a managed ns slot.",
			argumentHint: "<slug or path>",
			handler: async (args, ctx) => {
				await controller.handleObjectiveCommand(args, ctx);
			},
		},
	});
}

import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";

import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { HERDR_SPACE_OBJECTIVE_SUMMARY_COMMAND_NAME } from "../core/command-surfaces.ts";
import { createHerdrSidebarController, type HerdrSidebarController } from "../core/sidebar.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

export function registerHerdrSidebarCommands(
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
			handler: async (args, ctx) => controller.handleObjectiveCommand(args, ctx),
		},
	});
}

export function createHerdrSidebarControllerWithPiWiring(
	rawPi: ExtensionAPI,
): HerdrSidebarController {
	const pi = createHerdrPiCommandApi(rawPi);
	const herdr = createCliHerdrGateway(pi);
	return createHerdrSidebarController(pi, herdr);
}

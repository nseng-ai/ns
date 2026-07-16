import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";

import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME } from "../core/command-surfaces.ts";
import { createHerdrSidebarController, type HerdrSidebarController } from "../core/sidebar.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

export function registerHerdrSidebarCommands(
	pi: ExtensionAPI,
	controller: HerdrSidebarController,
): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
		commandDefinition: {
			description:
				"Apply an Objective label to the explicit caller workspace and the current slot " +
				"as the explicit caller pane title. Requires HERDR_WORKSPACE_ID and HERDR_PANE_ID.",
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

import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";

import { HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME } from "../core/command-surfaces.ts";
import { createHerdrSidebarController, type HerdrSidebarController } from "../core/sidebar.ts";
import type { HerdrPiRegistrationContext } from "./context.ts";
import { createHerdrPiContextAccessor } from "./context.ts";
import { createHerdrSlotsCapabilityProbe } from "./slots-capability.ts";

export function registerHerdrSidebarCommands(context: HerdrPiRegistrationContext): void;
export function registerHerdrSidebarCommands(
	pi: ExtensionAPI,
	controller: HerdrSidebarController,
): void;
export function registerHerdrSidebarCommands(
	contextOrPi: HerdrPiRegistrationContext | ExtensionAPI,
	injectedController?: HerdrSidebarController,
): void {
	let registration: HerdrPiRegistrationContext | undefined;
	let pi: Pick<ExtensionAPI, "registerCommand">;
	if (isHerdrPiRegistrationContext(contextOrPi)) {
		registration = contextOrPi;
		pi = contextOrPi.pi;
	} else {
		registration = undefined;
		pi = contextOrPi;
	}
	const createController = (cwd: string): HerdrSidebarController => {
		if (injectedController !== undefined) return injectedController;
		if (registration === undefined) {
			throw new Error("Herdr sidebar registration requires a controller or registration context.");
		}
		return createHerdrSidebarControllerWithPiWiring(registration, cwd);
	};
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
		commandDefinition: {
			description:
				"Apply an Objective label to the explicit caller Herdr workspace, prefixed with " +
				"the compact slot name when running in a managed ns slot with the Slots command " +
				"surface available.",
			argumentHint: "<slug or path>",
			handler: async (args, ctx) => {
				await createController(ctx.cwd).handleObjectiveCommand(args, ctx);
			},
		},
	});
}

function isHerdrPiRegistrationContext(
	value: HerdrPiRegistrationContext | ExtensionAPI,
): value is HerdrPiRegistrationContext {
	return "createNsExtensionApi" in value;
}

export function createHerdrSidebarControllerWithPiWiring(
	context: HerdrPiRegistrationContext,
	cwd: string,
): HerdrSidebarController {
	const getContext = createHerdrPiContextAccessor(context, cwd);
	return createHerdrSidebarController(
		context.pi,
		context.herdr,
		createHerdrSlotsCapabilityProbe(getContext),
	);
}

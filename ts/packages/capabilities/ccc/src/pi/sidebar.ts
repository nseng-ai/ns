import { registerCommandWithImmediateAck } from "@ns/pi/commands/ack";
import { expandRepoSkillBlock } from "@ns/pi/skills/expansion";
import {
	createCccSidebarController,
	type CccSidebarController,
	type ObjectiveSidebarHandlerOptions,
} from "../api/handlers.ts";
import type { ExtensionAPI } from "@ns/capability-kit/cmux/types";

const SESSION_SIDEBAR_COMMAND_NAME = "ccc:sidebar:session-summary";
const BRANCH_STATE_SIDEBAR_COMMAND_NAME = "ccc:sidebar:branch-state-summary";
const OBJECTIVE_SIDEBAR_COMMAND_NAME = "ccc:sidebar:objective-summary";

export function registerCccSidebarCommands(
	pi: ExtensionAPI,
	controller: CccSidebarController,
): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: SESSION_SIDEBAR_COMMAND_NAME,
		commandDefinition: {
			description: "Summarize this Pi session into the caller cmux sidebar.",
			handler: async (_args, ctx) => controller.handleSessionCommand(ctx),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: BRANCH_STATE_SIDEBAR_COMMAND_NAME,
		commandDefinition: {
			description:
				"Summarize the current branch state versus its parent into the caller cmux sidebar.",
			handler: async (_args, ctx) => controller.handleBranchStateCommand(ctx),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: OBJECTIVE_SIDEBAR_COMMAND_NAME,
		commandDefinition: {
			description: "Format Objective overview into the caller cmux sidebar.",
			argumentHint: "<slug or path>",
			handler: async (args, ctx) => controller.handleObjectiveCommand(args, ctx),
		},
	});
}

export function createCccSidebarControllerWithPiWiring(pi: ExtensionAPI): CccSidebarController {
	const objectiveSidebarOptions: ObjectiveSidebarHandlerOptions = {
		expandSkillBlock: async (cwd, skillName) => expandRepoSkillBlock({ cwd, skillName }),
	};
	const controller = createCccSidebarController(pi, objectiveSidebarOptions);
	pi.on("agent_end", controller.onAgentEnd);
	return controller;
}

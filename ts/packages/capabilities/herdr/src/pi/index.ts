export { default, registerHerdrPiExtension } from "./extension.ts";
export {
	HERDR_BASE_COMMAND_NAMES,
	HERDR_COMMAND_NAMES,
	HERDR_OPTIONAL_HANDOFF_COMMAND_NAMES,
	HERDR_SPACE_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_PROMPT_COMMAND_NAME,
	HERDR_SPACE_GOAL_COMMAND_NAME,
	HERDR_SPACE_NEW_COMMAND_NAME,
	HERDR_SPACE_OBJECTIVE_SUMMARY_COMMAND_NAME,
	HERDR_TAB_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_TAB_GOAL_COMMAND_NAME,
	HERDR_TAB_HANDOFF_COMMAND_NAME,
	HERDR_TAB_NEW_COMMAND_NAME,
} from "../core/command-surfaces.ts";
export { registerHerdrNewSpaceCommand } from "./new-space.ts";
export {
	registerHerdrSidebarCommands,
	createHerdrSidebarControllerWithPiWiring,
} from "./sidebar.ts";

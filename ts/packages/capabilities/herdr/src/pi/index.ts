export { default, registerHerdrPiExtension } from "./extension.ts";
export {
	HERDR_BASE_COMMAND_NAMES,
	HERDR_COMMAND_NAMES,
	HERDR_HANDOFF_TAB_COMMAND_NAME,
	HERDR_OPTIONAL_HANDOFF_COMMAND_NAMES,
} from "../core/command-surfaces.ts";
export { registerHerdrNewSpaceCommand } from "./new-space.ts";
export {
	registerHerdrSidebarCommands,
	createHerdrSidebarControllerWithPiWiring,
} from "./sidebar.ts";

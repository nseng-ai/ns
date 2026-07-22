import { nsCommandSurface } from "@nseng-ai/foundation/command";

// Canonical resource-first catalog of ns:herdr:* command surfaces.

export const HERDR_SPACE_NEW_COMMAND_NAME = nsCommandSurface("herdr", "space:new");
export const HERDR_SPACE_GOAL_COMMAND_NAME = nsCommandSurface("herdr", "space:goal");
export const HERDR_SPACE_OBJECTIVE_SUMMARY_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"space:objective-summary",
);
export const HERDR_SPACE_DISPATCH_PROMPT_COMMAND_NAME = nsCommandSurface("herdr", "space:prompt");
export const HERDR_SPACE_DISPATCH_TRUNK_PROMPT_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"space:trunk-prompt",
);
export const HERDR_SPACE_DISPATCH_PLAN_COMMAND_NAME = nsCommandSurface("herdr", "space:plan");
export const HERDR_SPACE_DISPATCH_TRUNK_PLAN_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"space:trunk-plan",
);
export const HERDR_TAB_NEW_COMMAND_NAME = nsCommandSurface("herdr", "tab:new");
export const HERDR_TAB_GOAL_COMMAND_NAME = nsCommandSurface("herdr", "tab:goal");
export const HERDR_TAB_DISPATCH_PLAN_COMMAND_NAME = nsCommandSurface("herdr", "tab:plan");
export const HERDR_TAB_HANDOFF_COMMAND_NAME = nsCommandSurface("herdr", "tab:handoff");

// Handoff remains optional; every other resource-first command is base registration.
export const HERDR_BASE_COMMAND_NAMES = [
	HERDR_SPACE_GOAL_COMMAND_NAME,
	HERDR_SPACE_NEW_COMMAND_NAME,
	HERDR_SPACE_OBJECTIVE_SUMMARY_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_PROMPT_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_TRUNK_PLAN_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_TRUNK_PROMPT_COMMAND_NAME,
	HERDR_TAB_GOAL_COMMAND_NAME,
	HERDR_TAB_NEW_COMMAND_NAME,
	HERDR_TAB_DISPATCH_PLAN_COMMAND_NAME,
] as const;

export const HERDR_OPTIONAL_HANDOFF_COMMAND_NAMES = [HERDR_TAB_HANDOFF_COMMAND_NAME] as const;

export const HERDR_COMMAND_NAMES = [
	HERDR_SPACE_GOAL_COMMAND_NAME,
	HERDR_SPACE_NEW_COMMAND_NAME,
	HERDR_SPACE_OBJECTIVE_SUMMARY_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_PROMPT_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_TRUNK_PLAN_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_TRUNK_PROMPT_COMMAND_NAME,
	HERDR_TAB_GOAL_COMMAND_NAME,
	HERDR_TAB_HANDOFF_COMMAND_NAME,
	HERDR_TAB_NEW_COMMAND_NAME,
	HERDR_TAB_DISPATCH_PLAN_COMMAND_NAME,
] as const;

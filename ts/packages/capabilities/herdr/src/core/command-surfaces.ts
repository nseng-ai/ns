import { nsCommandSurface } from "@nseng-ai/foundation/command";

// Canonical catalog of ns:herdr:* command surfaces. Pi command registration
// shares these names; import from here instead of spelling out raw `ns:herdr:*`
// literals.

export const HERDR_OBJECTIVE_SIDEBAR_SUMMARY_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"objective:sidebar-summary",
);

export const HERDR_SPACE_NEW_COMMAND_NAME = nsCommandSurface("herdr", "space:new");

export const HERDR_HANDOFF_PROMPT_COMMAND_NAME = nsCommandSurface("herdr", "handoff:prompt");

export const HERDR_HANDOFF_TRUNK_PROMPT_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"handoff:trunk-prompt",
);

export const HERDR_HANDOFF_PLAN_COMMAND_NAME = nsCommandSurface("herdr", "handoff:plan");

export const HERDR_HANDOFF_TAB_COMMAND_NAME = nsCommandSurface("herdr", "handoff:tab");

export const HERDR_TAB_PLAN_DISPATCH_COMMAND_NAME = nsCommandSurface("herdr", "tab:plan-dispatch");

export const HERDR_SPACE_OPEN_BRANCH_COMMAND_NAME = nsCommandSurface("herdr", "space:open-branch");

export const HERDR_SPACE_GOAL_COMMAND_NAME = nsCommandSurface("herdr", "space:goal");

export const HERDR_BASE_COMMAND_NAMES = [
	HERDR_HANDOFF_PLAN_COMMAND_NAME,
	HERDR_HANDOFF_PROMPT_COMMAND_NAME,
	HERDR_HANDOFF_TRUNK_PROMPT_COMMAND_NAME,
	HERDR_OBJECTIVE_SIDEBAR_SUMMARY_COMMAND_NAME,
	HERDR_SPACE_GOAL_COMMAND_NAME,
	HERDR_SPACE_NEW_COMMAND_NAME,
	HERDR_SPACE_OPEN_BRANCH_COMMAND_NAME,
	HERDR_TAB_PLAN_DISPATCH_COMMAND_NAME,
] as const;

export const HERDR_OPTIONAL_HANDOFF_COMMAND_NAMES = [HERDR_HANDOFF_TAB_COMMAND_NAME] as const;

export const HERDR_COMMAND_NAMES = [
	HERDR_HANDOFF_PLAN_COMMAND_NAME,
	HERDR_HANDOFF_PROMPT_COMMAND_NAME,
	HERDR_HANDOFF_TAB_COMMAND_NAME,
	HERDR_HANDOFF_TRUNK_PROMPT_COMMAND_NAME,
	HERDR_OBJECTIVE_SIDEBAR_SUMMARY_COMMAND_NAME,
	HERDR_SPACE_GOAL_COMMAND_NAME,
	HERDR_SPACE_NEW_COMMAND_NAME,
	HERDR_SPACE_OPEN_BRANCH_COMMAND_NAME,
	HERDR_TAB_PLAN_DISPATCH_COMMAND_NAME,
] as const;

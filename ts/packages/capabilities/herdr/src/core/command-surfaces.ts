import { nsCommandSurface } from "@nseng-ai/foundation/command";

// Canonical catalog of ns:herdr:* command surfaces. Pi command registration
// shares these names; import from here instead of spelling out raw `ns:herdr:*`
// literals.

export const HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"sidebar:objective-summary",
);

export const HERDR_SPACE_PROMPT_DISPATCH_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"space:prompt-dispatch",
);

export const HERDR_SPACE_TRUNK_PROMPT_DISPATCH_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"space:trunk-prompt-dispatch",
);

export const HERDR_SPACE_PLAN_DISPATCH_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"space:plan-dispatch",
);

export const HERDR_TAB_PLAN_DISPATCH_COMMAND_NAME = nsCommandSurface("herdr", "tab:plan-dispatch");

export const HERDR_SPACE_OPEN_BRANCH_COMMAND_NAME = nsCommandSurface("herdr", "space:open-branch");

export const HERDR_COMMAND_NAMES = [
	HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
	HERDR_SPACE_OPEN_BRANCH_COMMAND_NAME,
	HERDR_SPACE_PLAN_DISPATCH_COMMAND_NAME,
	HERDR_SPACE_PROMPT_DISPATCH_COMMAND_NAME,
	HERDR_SPACE_TRUNK_PROMPT_DISPATCH_COMMAND_NAME,
	HERDR_TAB_PLAN_DISPATCH_COMMAND_NAME,
] as const;

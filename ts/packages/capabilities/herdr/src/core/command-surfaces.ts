import { nsCommandSurface } from "@nseng-ai/foundation/command";

// Canonical catalog of ns:herdr:* command surfaces. Pi command registration
// shares these names; import from here instead of spelling out raw `ns:herdr:*`
// literals.

export const HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"sidebar:objective-summary",
);

export const HERDR_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"workspace:dispatch-prompt",
);

export const HERDR_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"workspace:dispatch-from-trunk",
);

export const HERDR_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"workspace:dispatch-plan",
);

export const HERDR_SURFACE_DISPATCH_PLAN_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"surface:dispatch-plan",
);

export const HERDR_WORKSPACE_OPEN_BRANCH_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"workspace:open-branch",
);

export const HERDR_COMMAND_NAMES = [
	HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
	HERDR_SURFACE_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME,
	HERDR_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME,
	HERDR_WORKSPACE_OPEN_BRANCH_COMMAND_NAME,
] as const;

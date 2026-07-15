import { nsCommandSurface } from "@nseng-ai/foundation/command";

// Canonical catalog of ns:cmux:* command surfaces. Pi command registration and
// cmux extension commands share these names; import from here instead of
// spelling out raw `ns:cmux:*` literals.

export const CMUX_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME = nsCommandSurface(
	"cmux",
	"workspace:dispatch-plan",
);
export const CMUX_SURFACE_DISPATCH_PLAN_COMMAND_NAME = nsCommandSurface(
	"cmux",
	"surface:dispatch-plan",
);
export const CMUX_WORKSPACE_OPEN_BRANCH_COMMAND_NAME = nsCommandSurface(
	"cmux",
	"workspace:open-branch",
);
export const CMUX_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME = nsCommandSurface(
	"cmux",
	"workspace:dispatch-prompt",
);
export const CMUX_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME = nsCommandSurface(
	"cmux",
	"workspace:dispatch-from-trunk",
);
export const CMUX_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME = nsCommandSurface(
	"cmux",
	"sidebar:objective-summary",
);

export const CMUX_COMMAND_NAMES = [
	CMUX_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
	CMUX_SURFACE_DISPATCH_PLAN_COMMAND_NAME,
	CMUX_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME,
	CMUX_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME,
	CMUX_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME,
	CMUX_WORKSPACE_OPEN_BRANCH_COMMAND_NAME,
] as const;

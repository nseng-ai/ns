import { nsCommandSurface } from "@nseng-ai/core/command";

// Canonical catalog of ns:ccc:* command surfaces. Pi command registration and
// cmux extension commands share these names; import from here instead of
// spelling out raw `ns:ccc:*` literals.

export const CCC_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME = nsCommandSurface(
	"ccc",
	"workspace:dispatch-plan",
);
export const CCC_SURFACE_DISPATCH_PLAN_COMMAND_NAME = nsCommandSurface(
	"ccc",
	"surface:dispatch-plan",
);
export const CCC_WORKSPACE_OPEN_BRANCH_COMMAND_NAME = nsCommandSurface(
	"ccc",
	"workspace:open-branch",
);
export const CCC_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME = nsCommandSurface(
	"ccc",
	"workspace:dispatch-prompt",
);
export const CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME = nsCommandSurface(
	"ccc",
	"workspace:dispatch-from-trunk",
);
export const CCC_CLAUDE_PLAN_TAB_COMMAND_NAME = nsCommandSurface("ccc", "claude-plan-tab");
export const CCC_SIDEBAR_SESSION_SUMMARY_COMMAND_NAME = nsCommandSurface(
	"ccc",
	"sidebar:session-summary",
);
export const CCC_SIDEBAR_BRANCH_STATE_SUMMARY_COMMAND_NAME = nsCommandSurface(
	"ccc",
	"sidebar:branch-state-summary",
);
export const CCC_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME = nsCommandSurface(
	"ccc",
	"sidebar:objective-summary",
);

export const CCC_COMMAND_NAMES = [
	CCC_CLAUDE_PLAN_TAB_COMMAND_NAME,
	CCC_SIDEBAR_BRANCH_STATE_SUMMARY_COMMAND_NAME,
	CCC_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
	CCC_SIDEBAR_SESSION_SUMMARY_COMMAND_NAME,
	CCC_SURFACE_DISPATCH_PLAN_COMMAND_NAME,
	CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME,
	CCC_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME,
	CCC_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME,
	CCC_WORKSPACE_OPEN_BRANCH_COMMAND_NAME,
] as const;

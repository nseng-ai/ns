import { defineNsPiExtensionSurface } from "@ns/pi/commands";

const CCC_PI_EXTENSION = defineNsPiExtensionSurface("ccc");

export const CCC_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME =
	CCC_PI_EXTENSION.command("workspace:dispatch-plan");
export const CCC_SURFACE_DISPATCH_PLAN_COMMAND_NAME =
	CCC_PI_EXTENSION.command("surface:dispatch-plan");
export const CCC_WORKSPACE_OPEN_BRANCH_COMMAND_NAME =
	CCC_PI_EXTENSION.command("workspace:open-branch");
export const CCC_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME = CCC_PI_EXTENSION.command(
	"workspace:dispatch-prompt",
);
export const CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME = CCC_PI_EXTENSION.command(
	"workspace:dispatch-from-trunk",
);
export const CCC_CLAUDE_PLAN_TAB_COMMAND_NAME = CCC_PI_EXTENSION.command("claude-plan-tab");
export const CCC_SIDEBAR_SESSION_SUMMARY_COMMAND_NAME =
	CCC_PI_EXTENSION.command("sidebar:session-summary");
export const CCC_SIDEBAR_BRANCH_STATE_SUMMARY_COMMAND_NAME = CCC_PI_EXTENSION.command(
	"sidebar:branch-state-summary",
);
export const CCC_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME = CCC_PI_EXTENSION.command(
	"sidebar:objective-summary",
);

import { registerCmuxSlotDispatchPromptCommand } from "./cmux/dispatch-prompt.ts";
import { createCmuxSidebarController, registerCmuxSidebarCommands } from "./cmux/sidebar.ts";
import { registerCmuxSlotDispatchPlanCommand } from "./cmux/slot-dispatch-plan.ts";
import { registerCmuxSlotOpenBranchCommand } from "./cmux/slot-open-branch.ts";
import type { ExtensionAPI } from "./cmux/types.ts";

export default function registerCmuxExtension(pi: ExtensionAPI): void {
	const sidebarController = createCmuxSidebarController(pi);
	registerCmuxSidebarCommands(pi, sidebarController);
	registerCmuxSlotDispatchPlanCommand(pi);
	registerCmuxSlotOpenBranchCommand(pi);
	registerCmuxSlotDispatchPromptCommand(pi);
}

import { registerCccClaudePlanTabCommand } from "./cmux/claude-plan-tab.ts";
import { registerCccSlotDispatchFromTrunkCommand } from "./cmux/dispatch-from-trunk.ts";
import { registerCccSlotDispatchPromptCommand } from "./cmux/dispatch-prompt.ts";
import { createCccSidebarController, registerCccSidebarCommands } from "./cmux/sidebar.ts";
import { registerCccSlotDispatchPlanCommand, registerCccSurfaceDispatchPlanCommand } from "./cmux/slot-dispatch-plan.ts";
import { registerCccSlotOpenBranchCommand } from "./cmux/slot-open-branch.ts";
import type { ExtensionAPI } from "./cmux/types.ts";

export default function registerCccExtension(pi: ExtensionAPI): void {
	const sidebarController = createCccSidebarController(pi);
	registerCccSidebarCommands(pi, sidebarController);
	registerCccSlotDispatchPlanCommand(pi);
	registerCccSurfaceDispatchPlanCommand(pi);
	registerCccSlotOpenBranchCommand(pi);
	registerCccSlotDispatchPromptCommand(pi);
	registerCccSlotDispatchFromTrunkCommand(pi);
	registerCccClaudePlanTabCommand(pi);
}

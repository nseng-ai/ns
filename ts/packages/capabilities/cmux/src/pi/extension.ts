import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";
import { registerCccClaudePlanTabCommand } from "./claude-plan-tab.ts";
import { registerCccSlotDispatchFromTrunkCommand } from "./dispatch-from-trunk.ts";
import { registerCccSlotDispatchPromptCommand } from "./dispatch-prompt.ts";
import { createCccSidebarControllerWithPiWiring, registerCccSidebarCommands } from "./sidebar.ts";
import {
	registerCccSlotDispatchPlanCommand,
	registerCccSurfaceDispatchPlanCommand,
} from "./slot-dispatch-plan.ts";
import { registerCccSlotOpenBranchCommand } from "./slot-open-branch.ts";

export default function registerCmuxPiExtension(pi: ExtensionAPI): void {
	const sidebarController = createCccSidebarControllerWithPiWiring(pi);
	registerCccSidebarCommands(pi, sidebarController);
	registerCccSlotDispatchPlanCommand(pi);
	registerCccSurfaceDispatchPlanCommand(pi);
	registerCccSlotOpenBranchCommand(pi);
	registerCccSlotDispatchPromptCommand(pi);
	registerCccSlotDispatchFromTrunkCommand(pi);
	registerCccClaudePlanTabCommand(pi);
}

export { registerCmuxPiExtension };

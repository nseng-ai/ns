import { registerCmuxDispatchCommand } from "./cmux/dispatch.ts";
import { registerCmuxSlotDispatchPlanCommand } from "./cmux/slot-dispatch-plan.ts";
import { registerCmuxSlotOpenBranchCommand } from "./cmux/slot-open-branch.ts";
import { createCmuxWorkspaceSummaryController, registerCmuxSidebarCommands } from "./cmux/workspace-summary.ts";
import type { ExtensionAPI } from "./cmux/types.ts";

export default function registerCmuxExtension(pi: ExtensionAPI): void {
	const summaryController = createCmuxWorkspaceSummaryController(pi);
	registerCmuxSidebarCommands(pi, summaryController);
	registerCmuxSlotDispatchPlanCommand(pi);
	registerCmuxSlotOpenBranchCommand(pi);
	registerCmuxDispatchCommand(pi);
}

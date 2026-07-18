import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";

import {
	createHerdrSidebarControllerWithPiWiring,
	registerHerdrSidebarCommands,
} from "./sidebar.ts";
import { registerHerdrSlotDispatchPromptCommand } from "./dispatch-prompt.ts";
import { registerHerdrSlotDispatchFromTrunkCommand } from "./dispatch-from-trunk.ts";
import {
	registerHerdrSlotDispatchPlanCommand,
	registerHerdrSurfaceDispatchPlanCommand,
} from "./dispatch-plan.ts";
import { createHerdrPiContext } from "./context.ts";
import { registerHerdrNewSpaceCommand } from "./new-space.ts";
import { registerHerdrSlotOpenBranchCommand } from "./open-branch.ts";
import { registerHerdrSpaceGoalCommand } from "./space-goal.ts";

export default function registerHerdrPiExtension(pi: ExtensionAPI): void {
	const context = createHerdrPiContext(pi);
	const sidebarController = createHerdrSidebarControllerWithPiWiring(pi);
	registerHerdrSidebarCommands(pi, sidebarController);
	registerHerdrSpaceGoalCommand(pi);
	registerHerdrSlotDispatchPromptCommand(pi);
	registerHerdrSlotDispatchFromTrunkCommand(pi);
	registerHerdrSlotDispatchPlanCommand(pi);
	registerHerdrSurfaceDispatchPlanCommand(pi);
	registerHerdrSlotOpenBranchCommand(pi);
	registerHerdrNewSpaceCommand(context);
}

export { registerHerdrPiExtension };

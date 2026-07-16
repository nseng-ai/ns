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
import { registerHerdrSlotOpenBranchCommand } from "./open-branch.ts";

export default function registerHerdrPiExtension(pi: ExtensionAPI): void {
	const sidebarController = createHerdrSidebarControllerWithPiWiring(pi);
	registerHerdrSidebarCommands(pi, sidebarController);
	registerHerdrSlotDispatchPromptCommand(pi);
	registerHerdrSlotDispatchFromTrunkCommand(pi);
	registerHerdrSlotDispatchPlanCommand(pi);
	registerHerdrSurfaceDispatchPlanCommand(pi);
	registerHerdrSlotOpenBranchCommand(pi);
}

export { registerHerdrPiExtension };

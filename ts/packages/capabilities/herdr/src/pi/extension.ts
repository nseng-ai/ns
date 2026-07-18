import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";

import { registerHerdrSidebarCommands } from "./sidebar.ts";
import { registerHerdrSlotDispatchPromptCommand } from "./dispatch-prompt.ts";
import { registerHerdrSlotDispatchFromTrunkCommand } from "./dispatch-from-trunk.ts";
import {
	registerHerdrSlotDispatchPlanCommand,
	registerHerdrSurfaceDispatchPlanCommand,
} from "./dispatch-plan.ts";
import { createHerdrPiRegistrationContext, type HerdrNsExtensionApiFactory } from "./context.ts";
import { registerHerdrNewSpaceCommand } from "./new-space.ts";
import { registerHerdrSlotOpenBranchCommand } from "./open-branch.ts";
import { registerHerdrSpaceGoalCommand } from "./space-goal.ts";

export default function registerHerdrPiExtension(
	pi: ExtensionAPI,
	createNsExtensionApi: HerdrNsExtensionApiFactory,
): void {
	const context = createHerdrPiRegistrationContext(pi, createNsExtensionApi);
	registerHerdrSidebarCommands(context);
	registerHerdrSpaceGoalCommand(context);
	registerHerdrSlotDispatchPromptCommand(pi);
	registerHerdrSlotDispatchFromTrunkCommand(pi);
	registerHerdrSlotDispatchPlanCommand(pi);
	registerHerdrSurfaceDispatchPlanCommand(pi);
	registerHerdrSlotOpenBranchCommand(pi);
	registerHerdrNewSpaceCommand(context);
}

export { registerHerdrPiExtension };
export type { HerdrNsExtensionApiFactory } from "./context.ts";

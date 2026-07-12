export { default, registerCccPiExtension } from "./extension.ts";
export { cccCommandBackedSkillRegistrations } from "./command-backed-skills.ts";
export { registerCccClaudePlanTabCommand } from "./claude-plan-tab.ts";
export { registerCccSlotDispatchFromTrunkCommand } from "./dispatch-from-trunk.ts";
export { registerCccSlotDispatchPromptCommand } from "./dispatch-prompt.ts";
export {
	registerCccSlotDispatchPlanCommand,
	registerCccSurfaceDispatchPlanCommand,
} from "./slot-dispatch-plan.ts";
export { registerCccSlotOpenBranchCommand } from "./slot-open-branch.ts";
export { registerCccSidebarCommands, createCccSidebarControllerWithPiWiring } from "./sidebar.ts";

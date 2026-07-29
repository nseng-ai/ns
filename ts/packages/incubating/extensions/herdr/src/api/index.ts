export {
	HERDR_BASE_COMMAND_NAMES,
	HERDR_COMMAND_NAMES,
	HERDR_OPTIONAL_HANDOFF_COMMAND_NAMES,
	HERDR_PLAN_SPACE_IMPL_COMMAND_NAME,
	HERDR_PLAN_TAB_IMPL_COMMAND_NAME,
	HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME,
	HERDR_SESSION_SPACE_IMPL_COMMAND_NAME,
	HERDR_SPACE_GOAL_COMMAND_NAME,
	HERDR_SPACE_NEW_COMMAND_NAME,
	HERDR_SPACE_OBJECTIVE_SUMMARY_COMMAND_NAME,
	HERDR_TAB_GOAL_COMMAND_NAME,
	HERDR_TAB_HANDOFF_COMMAND_NAME,
	HERDR_TAB_NEW_COMMAND_NAME,
} from "../core/command-surfaces.ts";
export {
	buildHerdrCreateTabArgs,
	buildHerdrCreateWorkspaceArgs,
	buildHerdrPaneRunArgs,
	createCliHerdrGateway,
} from "../core/cli-gateway.ts";
export type {
	HerdrCreateTabOptions,
	HerdrCreateTabResult,
	HerdrCreateWorkspaceOptions,
	HerdrCreateWorkspaceResult,
	HerdrGateway,
	HerdrPaneRunResult,
	HerdrTabRenameResult,
	HerdrWorkspaceRenameResult,
} from "../core/herdr-gateway.ts";
export {
	formatHerdrHandoffTabLaunchSuccess,
	formatHerdrHandoffTabRunFailure,
	launchHerdrHandoffTab,
} from "../core/handoff-tab.ts";
export type { HerdrHandoffTabLaunchResult } from "../core/handoff-tab.ts";
export { launchPreparedBranch } from "../core/prepared-launch.ts";
export type {
	HerdrNotifyLevel,
	OpenedPreparedLaunchTarget,
	PreparedLaunchContext,
	PreparedLaunchDestination,
	PreparedLaunchPayload,
	PreparedLaunchResult,
} from "../core/prepared-launch.ts";
export {
	compactSlotSlug,
	formatHerdrResourceLabel,
	slotLabelInput,
} from "../core/resource-label.ts";
export type { HerdrResourceLabelInput } from "../core/resource-label.ts";
export {
	checkoutSlot,
	createHerdrSlotClient,
	formatSlotCheckoutFailureCause,
} from "../core/slot-checkout.ts";
export type { SlotCheckoutRef } from "../core/slot-checkout.ts";
export { herdrHandoffTabLaunchNsCommand } from "../ns/commands/handoff-tab-launch.ts";

/** Resolve the explicit caller workspace injected by Herdr. */
export function getCallerWorkspaceId(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return trimmedEnvValue(env.HERDR_WORKSPACE_ID);
}

/** Resolve the explicit caller tab injected by Herdr. */
export function getCallerTabId(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return trimmedEnvValue(env.HERDR_TAB_ID);
}

function trimmedEnvValue(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

import { makeCommandProgressNotifier, registerCommandWithImmediateAck } from "@ns/pi/commands/ack";
import { formatImplBranchContextCommand } from "@ns/core/command";
import {
	CCC_SURFACE_DISPATCH_PLAN_COMMAND_NAME,
	CCC_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME,
	handleCccSlotDispatchPlan,
	type CccSlotDispatchPlanOptions,
	type DispatchPlanConfig,
} from "../api/handlers.ts";
import type { ExtensionAPI } from "@ns/capability-kit/cmux/types";

const WORKSPACE_COMMAND_NAME = CCC_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME;
const SURFACE_COMMAND_NAME = CCC_SURFACE_DISPATCH_PLAN_COMMAND_NAME;

const WORKSPACE_CONFIG: DispatchPlanConfig = {
	commandName: WORKSPACE_COMMAND_NAME,
	statusKey: WORKSPACE_COMMAND_NAME,
	destination: "workspace",
};

const SURFACE_CONFIG: DispatchPlanConfig = {
	commandName: SURFACE_COMMAND_NAME,
	statusKey: SURFACE_COMMAND_NAME,
	destination: "surface",
};

export function registerCccSlotDispatchPlanCommand(
	pi: ExtensionAPI,
	options: CccSlotDispatchPlanOptions = {},
): void {
	registerDispatchPlanCommand(pi, WORKSPACE_CONFIG, options);
}

export function registerCccSurfaceDispatchPlanCommand(
	pi: ExtensionAPI,
	options: CccSlotDispatchPlanOptions = {},
): void {
	registerDispatchPlanCommand(pi, SURFACE_CONFIG, options);
}

function registerDispatchPlanCommand(
	pi: ExtensionAPI,
	config: DispatchPlanConfig,
	options: CccSlotDispatchPlanOptions,
): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: config.commandName,
		commandDefinition: {
			description:
				"Attach the latest session-saved plan to a new Graphite-tracked branch via branch-context and launch it in a new cmux workspace.",
			argumentHint: "[--dry-run] [--help]",
			handler: async (rawArgs, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleCccSlotDispatchPlan({
					pi,
					rawArgs,
					ctx,
					options,
					config,
					notifyProgress,
					formatBranchContextCommand: formatImplBranchContextCommand,
				});
			},
		},
	});
}

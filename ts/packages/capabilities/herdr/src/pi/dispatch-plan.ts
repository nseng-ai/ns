import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";

import {
	handleHerdrSlotDispatchPlan,
	type DispatchPlanConfig,
	type HerdrSlotDispatchPlanOptions,
} from "../core/dispatch-plan.ts";
import {
	HERDR_TAB_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_TRUNK_PLAN_COMMAND_NAME,
} from "../core/command-surfaces.ts";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { createHerdrPiCommandApi, type HerdrPiCommandApi } from "./pi-command-api.ts";

const WORKSPACE_COMMAND_NAME = HERDR_SPACE_DISPATCH_PLAN_COMMAND_NAME;
const TRUNK_WORKSPACE_COMMAND_NAME = HERDR_SPACE_DISPATCH_TRUNK_PLAN_COMMAND_NAME;
const SURFACE_COMMAND_NAME = HERDR_TAB_DISPATCH_PLAN_COMMAND_NAME;

const WORKSPACE_CONFIG: DispatchPlanConfig = {
	commandName: WORKSPACE_COMMAND_NAME,
	statusKey: WORKSPACE_COMMAND_NAME,
	destination: "workspace",
};

const TRUNK_WORKSPACE_CONFIG: DispatchPlanConfig = {
	commandName: TRUNK_WORKSPACE_COMMAND_NAME,
	statusKey: TRUNK_WORKSPACE_COMMAND_NAME,
	destination: "workspace",
	branchBasis: "trunk",
};

const SURFACE_CONFIG: DispatchPlanConfig = {
	commandName: SURFACE_COMMAND_NAME,
	statusKey: SURFACE_COMMAND_NAME,
	destination: "tab",
};

export function registerHerdrSlotDispatchPlanCommand(
	rawPi: ExtensionAPI,
	options: HerdrSlotDispatchPlanOptions = {},
): void {
	registerDispatchPlanCommand(createHerdrPiCommandApi(rawPi), WORKSPACE_CONFIG, options);
}

export function registerHerdrSlotDispatchTrunkPlanCommand(
	rawPi: ExtensionAPI,
	options: HerdrSlotDispatchPlanOptions = {},
): void {
	registerDispatchPlanCommand(createHerdrPiCommandApi(rawPi), TRUNK_WORKSPACE_CONFIG, options);
}

export function registerHerdrSurfaceDispatchPlanCommand(
	rawPi: ExtensionAPI,
	options: HerdrSlotDispatchPlanOptions = {},
): void {
	registerDispatchPlanCommand(createHerdrPiCommandApi(rawPi), SURFACE_CONFIG, options);
}

function registerDispatchPlanCommand(
	pi: HerdrPiCommandApi,
	config: DispatchPlanConfig,
	options: HerdrSlotDispatchPlanOptions,
): void {
	const herdr = createCliHerdrGateway(pi);
	const basis = config.branchBasis === "trunk" ? "refreshed trunk" : "the current branch";
	const destination = config.destination === "workspace" ? "space" : "tab";
	registerCommandWithImmediateAck({
		host: pi,
		commandName: config.commandName,
		commandDefinition: {
			description: `Launch a plan from ${basis} in a new ${destination}.`,
			argumentHint: "[--dry-run] [--help]",
			handler: async (rawArgs, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrSlotDispatchPlan({
					pi,
					herdr,
					rawArgs,
					ctx,
					options,
					config,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

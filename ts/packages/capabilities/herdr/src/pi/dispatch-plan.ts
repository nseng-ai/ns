import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";

import {
	handleHerdrSlotDispatchPlan,
	type DispatchPlanConfig,
	type HerdrSlotDispatchPlanOptions,
} from "../core/dispatch-plan.ts";
import {
	HERDR_SURFACE_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME,
} from "../core/command-surfaces.ts";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { createHerdrPiCommandApi, type HerdrPiCommandApi } from "./pi-command-api.ts";

const WORKSPACE_COMMAND_NAME = HERDR_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME;
const SURFACE_COMMAND_NAME = HERDR_SURFACE_DISPATCH_PLAN_COMMAND_NAME;

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

export function registerHerdrSlotDispatchPlanCommand(
	rawPi: ExtensionAPI,
	options: HerdrSlotDispatchPlanOptions = {},
): void {
	registerDispatchPlanCommand(createHerdrPiCommandApi(rawPi), WORKSPACE_CONFIG, options);
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
	registerCommandWithImmediateAck({
		host: pi,
		commandName: config.commandName,
		commandDefinition: {
			description: `Attach the latest session-saved plan to a new Graphite-tracked branch via branch-context and launch it in a new Herdr ${config.destination}.`,
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
	});
}

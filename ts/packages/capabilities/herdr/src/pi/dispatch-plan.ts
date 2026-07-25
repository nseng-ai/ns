import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";
import { RealGitGateway } from "@nseng-ai/foundation/git";

import {
	handleHerdrSlotDispatchPlan,
	type DispatchPlanConfig,
	type HerdrSlotDispatchPlanOptions,
	type ResolvedHerdrSlotDispatchPlanOptions,
} from "../core/dispatch-plan.ts";
import {
	HERDR_TAB_DISPATCH_PLAN_COMMAND_NAME,
	HERDR_SPACE_DISPATCH_PLAN_COMMAND_NAME,
} from "../core/command-surfaces.ts";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { createHerdrPiCommandApi, type HerdrPiCommandApi } from "./pi-command-api.ts";

const WORKSPACE_COMMAND_NAME = HERDR_SPACE_DISPATCH_PLAN_COMMAND_NAME;
const TAB_COMMAND_NAME = HERDR_TAB_DISPATCH_PLAN_COMMAND_NAME;

const WORKSPACE_CONFIG: DispatchPlanConfig = {
	commandName: WORKSPACE_COMMAND_NAME,
	statusKey: WORKSPACE_COMMAND_NAME,
	destination: "workspace",
};

const TAB_CONFIG: DispatchPlanConfig = {
	commandName: TAB_COMMAND_NAME,
	statusKey: TAB_COMMAND_NAME,
	destination: "tab",
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
	registerDispatchPlanCommand(createHerdrPiCommandApi(rawPi), TAB_CONFIG, options);
}

function registerDispatchPlanCommand(
	pi: HerdrPiCommandApi,
	config: DispatchPlanConfig,
	options: HerdrSlotDispatchPlanOptions,
): void {
	const herdr = createCliHerdrGateway(pi);
	const dependencies: ResolvedHerdrSlotDispatchPlanOptions = {
		...options,
		graphite: options.graphite ?? new RealGraphiteBranchGateway(pi),
		git: options.git ?? new RealGitGateway(pi),
	};
	const destination = config.destination === "workspace" ? "space" : "tab";
	registerCommandWithImmediateAck({
		host: pi,
		commandName: config.commandName,
		commandDefinition: {
			description: `Launch a plan in a new ${destination}.`,
			argumentHint: "[--dry-run] [--help]",
			handler: async (rawArgs, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrSlotDispatchPlan({
					pi,
					herdr,
					rawArgs,
					ctx,
					options: dependencies,
					config,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

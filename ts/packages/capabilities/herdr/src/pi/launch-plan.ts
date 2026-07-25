import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";
import { RealGitGateway } from "@nseng-ai/foundation/git";

import {
	handleHerdrSlotLaunchPlan,
	type LaunchPlanConfig,
	type HerdrSlotLaunchPlanOptions,
	type ResolvedHerdrSlotLaunchPlanOptions,
} from "../core/launch-plan.ts";
import {
	HERDR_PLAN_TAB_LAUNCH_COMMAND_NAME,
	HERDR_PLAN_SPACE_LAUNCH_COMMAND_NAME,
} from "../core/command-surfaces.ts";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { createHerdrPiCommandApi, type HerdrPiCommandApi } from "./pi-command-api.ts";

const WORKSPACE_COMMAND_NAME = HERDR_PLAN_SPACE_LAUNCH_COMMAND_NAME;
const TAB_COMMAND_NAME = HERDR_PLAN_TAB_LAUNCH_COMMAND_NAME;

const WORKSPACE_CONFIG: LaunchPlanConfig = {
	commandName: WORKSPACE_COMMAND_NAME,
	statusKey: WORKSPACE_COMMAND_NAME,
	destination: "workspace",
};

const TAB_CONFIG: LaunchPlanConfig = {
	commandName: TAB_COMMAND_NAME,
	statusKey: TAB_COMMAND_NAME,
	destination: "tab",
};

export function registerHerdrPlanSpaceLaunchCommand(
	rawPi: ExtensionAPI,
	options: HerdrSlotLaunchPlanOptions = {},
): void {
	registerPlanLaunchCommand(createHerdrPiCommandApi(rawPi), WORKSPACE_CONFIG, options);
}

export function registerHerdrPlanTabLaunchCommand(
	rawPi: ExtensionAPI,
	options: HerdrSlotLaunchPlanOptions = {},
): void {
	registerPlanLaunchCommand(createHerdrPiCommandApi(rawPi), TAB_CONFIG, options);
}

function registerPlanLaunchCommand(
	pi: HerdrPiCommandApi,
	config: LaunchPlanConfig,
	options: HerdrSlotLaunchPlanOptions,
): void {
	const herdr = createCliHerdrGateway(pi);
	const dependencies: ResolvedHerdrSlotLaunchPlanOptions = {
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
				await handleHerdrSlotLaunchPlan({
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

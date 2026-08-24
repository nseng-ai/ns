import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";
import type { SlotClient } from "@nseng-ai/slots/api";
import { createNodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { createSessionPlanDiscoveryProcessGateway } from "@nseng-ai/pi-ns-branch-context/session-plan-discovery";

import {
	HERDR_PLAN_TAB_IMPL_COMMAND_NAME,
	HERDR_PLAN_SPACE_IMPL_COMMAND_NAME,
} from "@nseng-ai/herdr/api";
import { formatImplDestinationNoun } from "../core/impl-destination.ts";
import {
	handleHerdrSlotImplPlan,
	type ImplPlanConfig,
	type HerdrSlotImplPlanOptions,
} from "../core/impl-plan.ts";
import { createHerdrPiCommandContext, type HerdrPiContext } from "./context.ts";

const WORKSPACE_COMMAND_NAME = HERDR_PLAN_SPACE_IMPL_COMMAND_NAME;
const TAB_COMMAND_NAME = HERDR_PLAN_TAB_IMPL_COMMAND_NAME;

const WORKSPACE_CONFIG: ImplPlanConfig = {
	commandName: WORKSPACE_COMMAND_NAME,
	statusKey: WORKSPACE_COMMAND_NAME,
	destination: "workspace",
};

const TAB_CONFIG: ImplPlanConfig = {
	commandName: TAB_COMMAND_NAME,
	statusKey: TAB_COMMAND_NAME,
	destination: "tab",
};

export interface HerdrPlanImplRegistrationOptions extends HerdrSlotImplPlanOptions {
	planStoreRoot?: string;
	slotClient?: SlotClient;
}

export function registerHerdrPlanSpaceImplCommand(
	context: HerdrPiContext,
	options: HerdrPlanImplRegistrationOptions = {},
): void {
	registerPlanImplCommand(context, WORKSPACE_CONFIG, options);
}

export function registerHerdrPlanTabImplCommand(
	context: HerdrPiContext,
	options: HerdrPlanImplRegistrationOptions = {},
): void {
	registerPlanImplCommand(context, TAB_CONFIG, options);
}

function registerPlanImplCommand(
	context: HerdrPiContext,
	config: ImplPlanConfig,
	options: HerdrPlanImplRegistrationOptions,
): void {
	registerCommandWithImmediateAck({
		host: context.commands,
		commandName: config.commandName,
		commandDefinition: {
			description: `Implement a plan in a new ${formatImplDestinationNoun(config.destination)}.`,
			argumentHint: "[--dry-run] [--help]",
			handler: async (rawArgs, pi) => {
				const notifyProgress = makeCommandProgressNotifier({ host: context.commands, ctx: pi });
				await handleHerdrSlotImplPlan(createHerdrPiCommandContext(context, pi), {
					rawArgs,
					dependencies: {
						...options,
						sessionPlanDiscovery:
							options.sessionPlanDiscovery ??
							({
								modelPolicy: createNodeProjectConfigGateway(),
								process: createSessionPlanDiscoveryProcessGateway(context.commands),
							} as const),
					},
					config,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";
import type { SlotClient } from "@nseng-ai/slots/api";

import {
	HERDR_PLAN_TAB_IMPL_COMMAND_NAME,
	HERDR_PLAN_SPACE_IMPL_COMMAND_NAME,
} from "../core/command-surfaces.ts";
import {
	handleHerdrSlotImplPlan,
	type ImplPlanConfig,
	type HerdrSlotImplPlanOptions,
	type ResolvedHerdrSlotImplPlanOptions,
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

export interface HerdrPlanImplRegistrationOptions extends Omit<HerdrSlotImplPlanOptions, "git"> {
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
	const dependencies: ResolvedHerdrSlotImplPlanOptions = {
		...options,
		git: context.git,
	};
	const destination = config.destination === "workspace" ? "space" : "tab";
	registerCommandWithImmediateAck({
		host: context.commands,
		commandName: config.commandName,
		commandDefinition: {
			description: `Implement a plan in a new ${destination}.`,
			argumentHint: "[--dry-run] [--help]",
			handler: async (rawArgs, pi) => {
				const notifyProgress = makeCommandProgressNotifier({ host: context.commands, ctx: pi });
				await handleHerdrSlotImplPlan(createHerdrPiCommandContext(context, pi), {
					rawArgs,
					dependencies,
					config,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

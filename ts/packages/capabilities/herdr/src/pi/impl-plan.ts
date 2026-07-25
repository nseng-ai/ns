import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";
import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { SlotClient } from "@nseng-ai/slots/api";

import {
	HERDR_PLAN_TAB_IMPL_COMMAND_NAME,
	HERDR_PLAN_SPACE_IMPL_COMMAND_NAME,
} from "../core/command-surfaces.ts";
import type { HerdrGateway } from "../core/herdr-gateway.ts";
import {
	handleHerdrSlotImplPlan,
	type ImplPlanConfig,
	type HerdrSlotImplPlanOptions,
	type ResolvedHerdrSlotImplPlanOptions,
} from "../core/impl-plan.ts";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";

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

export interface HerdrPlanImplDependencies {
	commands: HerdrPiCommandApi;
	git: Pick<GitGateway, "currentBranch" | "optionalRepoRoot">;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	herdr: HerdrGateway;
}

export interface HerdrPlanImplRegistrationOptions extends Omit<
	HerdrSlotImplPlanOptions,
	"git" | "graphite"
> {
	planStoreRoot?: string;
	slotClient?: SlotClient;
	metadataDbAccess?: GraphiteMetadataDbAccess;
}

export function registerHerdrPlanSpaceImplCommand(
	dependencies: HerdrPlanImplDependencies,
	options: HerdrPlanImplRegistrationOptions = {},
): void {
	registerPlanImplCommand(dependencies, WORKSPACE_CONFIG, options);
}

export function registerHerdrPlanTabImplCommand(
	dependencies: HerdrPlanImplDependencies,
	options: HerdrPlanImplRegistrationOptions = {},
): void {
	registerPlanImplCommand(dependencies, TAB_CONFIG, options);
}

function registerPlanImplCommand(
	context: HerdrPlanImplDependencies,
	config: ImplPlanConfig,
	options: HerdrPlanImplRegistrationOptions,
): void {
	const dependencies: ResolvedHerdrSlotImplPlanOptions = {
		...options,
		graphite: context.graphite,
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
				await handleHerdrSlotImplPlan(
					{ commands: context.commands, herdr: context.herdr, pi },
					{
						rawArgs,
						dependencies,
						config,
						notifyProgress,
					},
				);
			},
		},
		options: { delivery: "message" },
	});
}

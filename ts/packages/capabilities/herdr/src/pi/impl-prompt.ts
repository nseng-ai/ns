import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME } from "../core/command-surfaces.ts";
import type { HerdrGateway } from "../core/herdr-gateway.ts";
import {
	handleHerdrSlotImplPrompt,
	resolveImplPromptPayloadOptions,
	type ImplPromptPayloadOptions,
} from "../core/impl-prompt.ts";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";
import { HerdrPiContext } from "./context.ts";

const COMMAND_NAME = HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME;

export interface HerdrPromptSpaceImplDependencies {
	commands: HerdrPiCommandApi;
	git: Pick<GitGateway, "createBranchAtStartPoint" | "currentBranch" | "optionalRepoRoot">;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	herdr: HerdrGateway;
}

export interface HerdrPromptSpaceImplRegistrationOptions extends ImplPromptPayloadOptions {
	slotClient?: SlotClient;
	metadataDbAccess?: GraphiteMetadataDbAccess;
}

export function registerHerdrPromptSpaceImplCommand(
	dependencies: HerdrPromptSpaceImplDependencies,
	options: HerdrPromptSpaceImplRegistrationOptions = {},
): void {
	const payloadOptions = resolveImplPromptPayloadOptions(options);

	registerCommandWithImmediateAck({
		host: dependencies.commands,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Implement a prompt in a new space.",
			argumentHint: "<prompt>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({
					host: dependencies.commands,
					ctx,
				});
				await handleHerdrSlotImplPrompt(new HerdrPiContext({ ...dependencies, pi: ctx }), {
					payloadOptions,
					...optionalEntry("slotClient", options.slotClient),
					...optionalEntry("metadataDbAccess", options.metadataDbAccess),
					args,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

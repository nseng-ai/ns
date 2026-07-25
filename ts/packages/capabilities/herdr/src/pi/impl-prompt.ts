import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME } from "../core/command-surfaces.ts";
import {
	handleHerdrSlotImplPrompt,
	resolveImplPromptPayloadOptions,
	type ImplPromptPayloadOptions,
} from "../core/impl-prompt.ts";
import { createHerdrPiCommandContext, type HerdrPiContext } from "./context.ts";

const COMMAND_NAME = HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME;

export interface HerdrPromptSpaceImplRegistrationOptions extends ImplPromptPayloadOptions {
	slotClient?: SlotClient;
}

export function registerHerdrPromptSpaceImplCommand(
	context: HerdrPiContext,
	options: HerdrPromptSpaceImplRegistrationOptions = {},
): void {
	const payloadOptions = resolveImplPromptPayloadOptions(options);

	registerCommandWithImmediateAck({
		host: context.commands,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Implement a prompt in a new space.",
			argumentHint: "<prompt>",
			handler: async (args, pi) => {
				const notifyProgress = makeCommandProgressNotifier({ host: context.commands, ctx: pi });
				await handleHerdrSlotImplPrompt(createHerdrPiCommandContext(context, pi), {
					payloadOptions,
					...optionalEntry("slotClient", options.slotClient),
					args,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

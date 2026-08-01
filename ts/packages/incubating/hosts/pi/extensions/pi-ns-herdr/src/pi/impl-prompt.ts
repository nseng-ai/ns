import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";
import type { SlotClient } from "@nseng-ai/slots/api";

import {
	HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME,
	HERDR_PROMPT_TAB_IMPL_COMMAND_NAME,
} from "@nseng-ai/herdr/api";
import {
	formatImplDestinationNoun,
	prepareImplDestination,
	type ImplDestination,
} from "../core/impl-destination.ts";
import {
	handleHerdrSlotImplPrompt,
	resolveImplPromptPayloadOptions,
	type ImplPromptPayloadOptions,
} from "../core/impl-prompt.ts";
import { createHerdrPiCommandContext, type HerdrPiContext } from "./context.ts";

interface PromptImplConfig {
	readonly commandName: string;
	readonly destination: ImplDestination;
}

const SPACE_CONFIG: PromptImplConfig = {
	commandName: HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME,
	destination: "workspace",
};

const TAB_CONFIG: PromptImplConfig = {
	commandName: HERDR_PROMPT_TAB_IMPL_COMMAND_NAME,
	destination: "tab",
};

export interface HerdrPromptImplRegistrationOptions extends ImplPromptPayloadOptions {
	slotClient?: SlotClient;
}

export function registerHerdrPromptSpaceImplCommand(
	context: HerdrPiContext,
	options: HerdrPromptImplRegistrationOptions = {},
): void {
	registerPromptImplCommand(context, SPACE_CONFIG, options);
}

export function registerHerdrPromptTabImplCommand(
	context: HerdrPiContext,
	options: HerdrPromptImplRegistrationOptions = {},
): void {
	registerPromptImplCommand(context, TAB_CONFIG, options);
}

function registerPromptImplCommand(
	context: HerdrPiContext,
	config: PromptImplConfig,
	options: HerdrPromptImplRegistrationOptions,
): void {
	const payloadOptions = resolveImplPromptPayloadOptions(options);

	registerCommandWithImmediateAck({
		host: context.commands,
		commandName: config.commandName,
		commandDefinition: {
			description: `Implement a prompt in a new ${formatImplDestinationNoun(config.destination)}.`,
			argumentHint: "<prompt>",
			handler: async (args, pi) => {
				const preparedDestination = prepareImplDestination(config.destination, config.commandName);
				if (preparedDestination.type === "failed") {
					pi.ui.notify(preparedDestination.message, "error");
					return;
				}
				const notifyProgress = makeCommandProgressNotifier({ host: context.commands, ctx: pi });
				await handleHerdrSlotImplPrompt(createHerdrPiCommandContext(context, pi), {
					payloadOptions,
					...optionalEntry("slotClient", options.slotClient),
					args,
					commandName: config.commandName,
					destination: preparedDestination.destination,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

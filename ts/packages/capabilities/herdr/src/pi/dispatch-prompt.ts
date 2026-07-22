import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";

import {
	handleHerdrSlotDispatchPrompt,
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
} from "../core/dispatch-prompt.ts";
import { HERDR_SPACE_DISPATCH_PROMPT_COMMAND_NAME } from "../core/command-surfaces.ts";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

const COMMAND_NAME = HERDR_SPACE_DISPATCH_PROMPT_COMMAND_NAME;

export function registerHerdrSlotDispatchPromptCommand(
	rawPi: ExtensionAPI,
	options: DispatchPromptPayloadOptions = {},
): void {
	const pi = createHerdrPiCommandApi(rawPi);
	const herdr = createCliHerdrGateway(pi);
	const payloadOptions = resolveDispatchPromptPayloadOptions(options);

	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Launch a prompt from the current branch in a new space.",
			argumentHint: "<prompt>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrSlotDispatchPrompt({
					pi,
					herdr,
					payloadOptions,
					...optionalEntry("slotClient", options.slotClient),
					args,
					ctx,
					notifyProgress,
				});
			},
		},
	});
}

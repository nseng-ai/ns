import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { RealGitGateway } from "@nseng-ai/foundation/git";
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
	const git = options.git ?? new RealGitGateway(pi);
	const graphite = options.graphite ?? new RealGraphiteBranchGateway(pi);

	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Launch a prompt in a new space.",
			argumentHint: "<prompt>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrSlotDispatchPrompt({
					pi,
					herdr,
					payloadOptions,
					...optionalEntry("slotClient", options.slotClient),
					graphite,
					git,
					...optionalEntry("metadataDbAccess", options.metadataDbAccess),
					args,
					ctx,
					notifyProgress,
				});
			},
		},
		options: { delivery: "message" },
	});
}

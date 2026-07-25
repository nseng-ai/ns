import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";

import {
	handleHerdrSlotLaunchPrompt,
	resolveLaunchPromptPayloadOptions,
	type LaunchPromptPayloadOptions,
} from "../core/launch-prompt.ts";
import { HERDR_PROMPT_SPACE_LAUNCH_COMMAND_NAME } from "../core/command-surfaces.ts";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

const COMMAND_NAME = HERDR_PROMPT_SPACE_LAUNCH_COMMAND_NAME;

export function registerHerdrPromptSpaceLaunchCommand(
	rawPi: ExtensionAPI,
	options: LaunchPromptPayloadOptions = {},
): void {
	const pi = createHerdrPiCommandApi(rawPi);
	const herdr = createCliHerdrGateway(pi);
	const payloadOptions = resolveLaunchPromptPayloadOptions(options);
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
				await handleHerdrSlotLaunchPrompt({
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

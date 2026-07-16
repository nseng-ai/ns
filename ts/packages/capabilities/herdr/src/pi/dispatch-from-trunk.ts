import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";

import {
	handleHerdrSlotDispatchFromTrunk,
	createRealHerdrDispatchFromTrunkDeps,
} from "../core/dispatch-from-trunk.ts";
import {
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
} from "../core/dispatch-prompt.ts";
import { HERDR_SPACE_TRUNK_PROMPT_DISPATCH_COMMAND_NAME } from "../core/command-surfaces.ts";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

const COMMAND_NAME = HERDR_SPACE_TRUNK_PROMPT_DISPATCH_COMMAND_NAME;

export interface HerdrSlotDispatchFromTrunkRegistrationOptions extends DispatchPromptPayloadOptions {
	metadataDbAccess?: GraphiteMetadataDbAccess;
}

export function registerHerdrSlotDispatchFromTrunkCommand(
	rawPi: ExtensionAPI,
	options: HerdrSlotDispatchFromTrunkRegistrationOptions = {},
): void {
	const pi = createHerdrPiCommandApi(rawPi);
	const herdr = createCliHerdrGateway(pi);
	const payloadOptions = resolveDispatchPromptPayloadOptions(options);
	const { graphite, git } = createRealHerdrDispatchFromTrunkDeps(pi);

	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Create a Graphite-tracked branch from the refreshed trunk and launch it in a new Herdr workspace.",
			argumentHint: "<task>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrSlotDispatchFromTrunk({
					pi,
					herdr,
					payloadOptions,
					graphite,
					git,
					args,
					ctx,
					...optionalEntry("slotClient", options.slotClient),
					...optionalEntry("metadataDbAccess", options.metadataDbAccess),
					notifyProgress,
				});
			},
		},
	});
}

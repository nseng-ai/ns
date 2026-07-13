import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import {
	CMUX_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME,
	handleCccSlotDispatchFromTrunk,
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
} from "../api/handlers.ts";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";
import { createCccPiCommandApi } from "./pi-command-api.ts";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";

const COMMAND_NAME = CMUX_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME;

export interface CccSlotDispatchFromTrunkOptions extends DispatchPromptPayloadOptions {
	metadataDbAccess?: GraphiteMetadataDbAccess;
}

export function registerCccSlotDispatchFromTrunkCommand(
	rawPi: ExtensionAPI,
	options: CccSlotDispatchFromTrunkOptions = {},
): void {
	const pi = createCccPiCommandApi(rawPi);
	const payloadOptions = resolveDispatchPromptPayloadOptions(options);
	const graphite = new RealGraphiteBranchGateway(pi);
	const git = new RealGitGateway(pi);
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Create a Graphite-tracked branch from the refreshed configured Graphite trunk and its configured Git upstream, then launch it in a new cmux workspace.",
			argumentHint: "<task>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleCccSlotDispatchFromTrunk({
					pi,
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

import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import {
	CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME,
	handleCccSlotDispatchFromTrunk,
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
} from "../api/handlers.ts";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";

const COMMAND_NAME = CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME;

export interface CccSlotDispatchFromTrunkOptions extends DispatchPromptPayloadOptions {
	metadataDbAccess?: GraphiteMetadataDbAccess;
}

export function registerCccSlotDispatchFromTrunkCommand(
	pi: ExtensionAPI,
	options: CccSlotDispatchFromTrunkOptions = {},
): void {
	const payloadOptions = resolveDispatchPromptPayloadOptions(options);
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Create a Graphite-tracked branch from trunk/main and launch it in a new cmux workspace.",
			argumentHint: "<task>",
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleCccSlotDispatchFromTrunk({
					pi,
					payloadOptions,
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

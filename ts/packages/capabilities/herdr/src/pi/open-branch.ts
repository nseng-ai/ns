import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi/commands/ack";
import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";

import {
	getBranchCompletions,
	handleHerdrSlotOpenBranch,
	type HerdrSlotOpenBranchOptions,
} from "../core/open-branch.ts";
import { HERDR_WORKSPACE_OPEN_BRANCH_COMMAND_NAME } from "../core/command-surfaces.ts";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

const COMMAND_NAME = HERDR_WORKSPACE_OPEN_BRANCH_COMMAND_NAME;

export function registerHerdrSlotOpenBranchCommand(
	rawPi: ExtensionAPI,
	options: HerdrSlotOpenBranchOptions = {},
): void {
	const pi = createHerdrPiCommandApi(rawPi);
	const herdr = createCliHerdrGateway(pi);

	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Open an existing Git branch in a new Herdr workspace.",
			argumentHint: "<branch>",
			getArgumentCompletions: async (prefix) => getBranchCompletions(pi, process.cwd(), prefix),
			handler: async (args, ctx) => {
				const notifyProgress = makeCommandProgressNotifier({ host: pi, ctx });
				await handleHerdrSlotOpenBranch({
					pi,
					herdr,
					args,
					ctx,
					options,
					notifyProgress,
				});
			},
		},
	});
}

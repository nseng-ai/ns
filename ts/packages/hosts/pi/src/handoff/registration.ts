import { registerCommandWithImmediateAck } from "../commands/ack.ts";
import { definePiSurfaceParity } from "../parity/extension.ts";
import {
	buildDeriveHandoffSlugTool,
	buildHandoffTabLaunchTool,
	handleHandoffTabCommand,
} from "./tab.ts";
import { createHandoffSelfWorkflow } from "./self.ts";
import { handleCreateHandoffCommand } from "./create.ts";
import { handleListHandoffCommand, handlePickupHandoffCommand } from "./pickup-list.ts";
import { HANDOFF_LIST_MESSAGE_TYPE, renderHandoffListMessage } from "./list-rendering.ts";
import {
	CREATE_HANDOFF_COMMAND_NAME,
	HANDOFF_SELF_COMMAND_NAME,
	HANDOFF_TAB_COMMAND_NAME,
	LIST_HANDOFF_COMMAND_NAME,
	PICKUP_HANDOFF_COMMAND_NAME,
} from "./shared.ts";
import type { ExtensionAPI } from "./runtime-types.ts";

export const handoffParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: CREATE_HANDOFF_COMMAND_NAME,
		workflow: "Create a directed handoff artifact for a future continuation",
		parity: "FULL",
		cli: "sdl handoff create",
		skill: "handoff-create",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "handoff",
		notes:
			"Pi command expands the portable handoff-create skill; the final artifact is stored through `sdl handoff create` after model confirmation.",
	},
	{
		kind: "command",
		surface: PICKUP_HANDOFF_COMMAND_NAME,
		workflow: "Pick up an existing handoff artifact",
		parity: "FULL",
		cli: "sdl handoff pickup",
		skill: "handoff-pickup",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "handoff",
		notes:
			"Pi command reads Handoff artifacts through the Handoff Capability API and expands the same portable pickup workflow.",
	},
	{
		kind: "command",
		surface: LIST_HANDOFF_COMMAND_NAME,
		workflow: "List handoff artifacts for this branch or active local branches",
		parity: "FULL",
		cli: "sdl handoff list",
		skill: "handoff-pickup",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "handoff",
		notes: "List support is part of the portable handoff pickup/list workflow.",
	},
	{
		kind: "command",
		surface: HANDOFF_TAB_COMMAND_NAME,
		workflow: "Create a handoff and open a focused cmux tab to pick it up",
		parity: "WAIVED",
		fallback:
			"Create the handoff with handoff-create, then manually open the target harness/session and pick it up with handoff-pickup.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "handoff",
		notes:
			"Focused cmux tab launch is a Pi/cmux session primitive; storage and pickup are separately portable.",
	},
	{
		kind: "command",
		surface: HANDOFF_SELF_COMMAND_NAME,
		workflow:
			"Create a handoff, replace the current Pi session, and pick it up in the fresh session",
		parity: "WAIVED",
		fallback:
			"Create the handoff with handoff-create, start a new Pi session manually, then run handoff-pickup for the saved artifact.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "handoff",
		notes:
			"Self handoff stores through the portable handoff workflow, waits for the verified handoff_self_queue_pickup tool result, then uses Pi command-context session replacement to send a natural-language pickup prompt.",
	},
] as const);

export default function handoffExtension(pi: ExtensionAPI): void {
	pi.registerMessageRenderer?.(HANDOFF_LIST_MESSAGE_TYPE, renderHandoffListMessage);

	if (pi.registerTool !== undefined) {
		const selfWorkflow = createHandoffSelfWorkflow(pi);
		pi.registerTool(buildDeriveHandoffSlugTool(pi));
		pi.registerTool(buildHandoffTabLaunchTool(pi));
		pi.registerTool(selfWorkflow.buildTool());
		registerCommandWithImmediateAck({
			host: pi,
			commandName: HANDOFF_TAB_COMMAND_NAME,
			commandDefinition: {
				description: "Create a handoff and open a focused cmux tab to pick it up.",
				handler: async (args, ctx) => handleHandoffTabCommand(pi, args, ctx),
			},
		});
		registerCommandWithImmediateAck({
			host: pi,
			commandName: HANDOFF_SELF_COMMAND_NAME,
			commandDefinition: {
				description: "Create a handoff, clear context, and pick it up in this Pi session.",
				handler: async (args, ctx) => selfWorkflow.handleCommand(args, ctx),
			},
		});
	}

	registerCommandWithImmediateAck({
		host: pi,
		commandName: CREATE_HANDOFF_COMMAND_NAME,
		commandDefinition: {
			description: "Create a directed handoff artifact for a future continuation.",
			handler: async (args, ctx) => handleCreateHandoffCommand(pi, args, ctx),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: PICKUP_HANDOFF_COMMAND_NAME,
		commandDefinition: {
			description: "Pick up a handoff by slug, selector, or picker.",
			handler: async (args, ctx) => handlePickupHandoffCommand(pi, args, ctx),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: LIST_HANDOFF_COMMAND_NAME,
		commandDefinition: {
			description: "List handoffs on this branch or across active branches.",
			handler: async (args, ctx) => handleListHandoffCommand(pi, args, ctx),
		},
	});
}

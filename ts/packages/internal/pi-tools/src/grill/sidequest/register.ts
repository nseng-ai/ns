import { randomUUID } from "node:crypto";

import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import {
	GRILL_RETURN_COMMAND_NAME,
	GRILL_SIDEQUEST_COMMAND_NAME,
} from "@nseng-ai/pi/grill/surfaces";

import type { ExtensionAPI } from "../protocol.ts";
import { handleGrillReturnCommand, handleGrillSidequestCommand } from "./commands.ts";
import {
	createGrillSidequestRuntimeState,
	handleAgentSettled,
	handleSessionBeforeTree,
	handleSessionShutdown,
	handleSessionTree,
} from "./hooks.ts";
import type { GrillSidequestCapability, GrillSidequestEvent, SidequestHost } from "./protocol.ts";
import { GRILL_SIDEQUEST_EVENT_ENTRY_TYPE } from "./state.ts";
import { refreshGrillStatusWidget } from "./status.ts";

export interface RegisterGrillSidequestOptions {
	createQuestId?: () => string;
}

/**
 * The grill module's base `ExtensionAPI` deliberately omits event and
 * session-entry capabilities so existing fakes keep compiling. Side-quest
 * registration only happens on hosts that expose them (real Pi does).
 */
export function isSidequestCapableHost(pi: ExtensionAPI): pi is ExtensionAPI & SidequestHost {
	const candidate: unknown = pi;
	if (!isRecord(candidate)) return false;
	return (
		typeof candidate.on === "function" &&
		typeof candidate.appendEntry === "function" &&
		typeof candidate.setLabel === "function"
	);
}

/** Single wiring and ownership point for the optional side-quest capability. */
export function registerGrillSidequest(
	pi: SidequestHost,
	options: RegisterGrillSidequestOptions = {},
): GrillSidequestCapability {
	const state = createGrillSidequestRuntimeState();
	const createQuestId = options.createQuestId ?? randomUUID;
	const capability: GrillSidequestCapability = {
		startSideQuest: (topic, pendingAsk) => {
			const questId = createQuestId();
			const event: GrillSidequestEvent = {
				version: 1,
				event: "started",
				questId,
				topic,
				...(pendingAsk === undefined ? {} : { pendingAsk }),
			};
			pi.appendEntry(GRILL_SIDEQUEST_EVENT_ENTRY_TYPE, event);
			state.stashPendingMarkLabel(questId, pendingAsk?.question ?? `Side quest: ${topic}`);
			return questId;
		},
	};

	registerCommandWithImmediateAck({
		host: pi,
		commandName: GRILL_SIDEQUEST_COMMAND_NAME,
		commandDefinition: {
			description:
				"Start a grill side quest on a topic before answering the pending grill question.",
			handler: async (args, ctx) => handleGrillSidequestCommand({ pi, capability, args, ctx }),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: GRILL_RETURN_COMMAND_NAME,
		commandDefinition: {
			description: "Return from the active grill side quest to the marked pending question.",
			handler: async (_args, ctx) => handleGrillReturnCommand(ctx, state),
		},
	});

	pi.on("session_before_tree", async (event, ctx) => handleSessionBeforeTree(event, ctx, state));
	pi.on("session_tree", (event, ctx) => {
		handleSessionTree(pi, event, ctx);
	});
	pi.on("agent_settled", (_event, ctx) => {
		handleAgentSettled(pi, state, ctx);
	});
	pi.on("turn_end", (_event, ctx) => {
		refreshGrillStatusWidget(ctx);
	});
	pi.on("session_start", (_event, ctx) => {
		refreshGrillStatusWidget(ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		handleSessionShutdown(ctx);
	});

	return capability;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

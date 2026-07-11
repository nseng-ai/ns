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
	stashPendingMarkLabel,
} from "./hooks.ts";
import type { SideQuestStartedInfo, SidequestHost } from "./protocol.ts";
import { refreshGrillStatusWidget } from "./status.ts";

export interface GrillSidequestRegistration {
	/** Passed into grill_ask execution so freeform side-quest starts get their mark labeled. */
	onSideQuestStarted(info: SideQuestStartedInfo): void;
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

/** Single wiring point for the side-quest workflow; delete the call site to rip the feature out. */
export function registerGrillSidequest(pi: SidequestHost): GrillSidequestRegistration {
	const state = createGrillSidequestRuntimeState();

	registerCommandWithImmediateAck({
		host: pi,
		commandName: GRILL_SIDEQUEST_COMMAND_NAME,
		commandDefinition: {
			description:
				"Start a grill side quest on a topic before answering the pending grill question.",
			handler: async (args, ctx) => handleGrillSidequestCommand(pi, args, ctx),
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

	return {
		onSideQuestStarted: (info) => {
			stashPendingMarkLabel(state, info);
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

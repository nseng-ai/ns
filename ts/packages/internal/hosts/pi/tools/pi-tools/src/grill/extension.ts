import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import {
	GRILL_ASK_ROUND_TOOL_NAME,
	GRILL_UI_COMMAND_NAME,
	GRILL_WITH_DOCS_UI_COMMAND_NAME,
	deactivateGrillAskRoundTool,
} from "@nseng-ai/pi-runtime/grill/surfaces";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";

import { executeGrillAskRound } from "./round-execution.ts";
import { GRILL_ASK_ROUND_PARAMETERS } from "./round-protocol.ts";
import type { ExtensionAPI } from "./protocol.ts";
import { handleGrillUiCommand, handleGrillWithDocsUiCommand } from "./runtime.ts";
import { registerGrillStatusLifecycle } from "./status.ts";

export { executeGrillAskRound } from "./round-execution.ts";
export {
	grillRoundInputSchema,
	validateGrillRoundInput,
	type GrillDecisionRoundInput,
	type GrillRoundAnswer,
	type GrillRoundDetails,
	type GrillRoundInput,
	type GrillRoundToolContext,
	type GrillRoundToolResult,
	type GrillRoundUiOutcome,
	type GrillRoundValidation,
} from "./round-protocol.ts";
export { GrillRoundController, type GrillRoundView } from "./round-controller.ts";
export {
	grillRoundInlineRuntimeFromModule,
	runGrillRoundInlineUi,
	runGrillRoundInlineUiWithRuntime,
	type GrillRoundInlineRuntime,
} from "./round-ui.ts";
export { GRILL_UI_CONTRACT, buildGrillUiPrompt, buildGrillWithDocsUiPrompt } from "./prompts.ts";
export type { ExtensionAPI, GrillUiCommandContext, ToolDefinition } from "./protocol.ts";
export { handleGrillUiCommand, handleGrillWithDocsUiCommand } from "./runtime.ts";
export {
	GRILL_ASK_ROUND_TOOL_NAME,
	GRILL_UI_COMMAND_NAME,
	GRILL_UI_SKILL_NAME,
	GRILL_WITH_DOCS_UI_COMMAND_NAME,
	GRILL_WITH_DOCS_UI_SKILL_NAME,
} from "@nseng-ai/pi-runtime/grill/surfaces";

export const grillUiParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: GRILL_UI_COMMAND_NAME,
		workflow: "Start a structured grilling interview",
		parity: "WAIVED",
		fallback: "Use the grill-me skill for a prose interview outside Pi.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@internal/pi-tools/grill",
		sourceModule: "grill-ui",
		notes: "Structured TUI interaction is Pi-native; portable fallback is the skill workflow.",
	},
	{
		kind: "command",
		surface: GRILL_WITH_DOCS_UI_COMMAND_NAME,
		workflow: "Start a docs-aware structured grilling interview",
		parity: "WAIVED",
		fallback: "Use the grill-with-docs skill for a prose docs-aware interview outside Pi.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@internal/pi-tools/grill",
		sourceModule: "grill-ui",
		notes:
			"Structured TUI interaction is Pi-native; portable fallback is the docs-aware skill workflow.",
	},
] as const);

export function registerGrillUiExtension(pi: ExtensionAPI): void {
	registerGrillStatusLifecycle(pi);
	registerGrillRoundStartupDeactivation(pi);

	registerCommandWithImmediateAck({
		host: pi,
		commandName: GRILL_UI_COMMAND_NAME,
		commandDefinition: {
			description: "Start a grill-me session that uses structured question UI.",
			handler: async (args, ctx) => handleGrillUiCommand(pi, args, ctx),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: GRILL_WITH_DOCS_UI_COMMAND_NAME,
		commandDefinition: {
			description: "Start a docs-aware grill-with-docs session that uses structured question UI.",
			handler: async (args, ctx) => handleGrillWithDocsUiCommand(pi, args, ctx),
		},
	});

	pi.registerTool({
		name: GRILL_ASK_ROUND_TOOL_NAME,
		label: "Grill Ask Round",
		description:
			"Run one atomic structured-grilling interaction. In decision-round mode provide the complete ordered current design-tree frontier with stable attempt-scoped IDs, 2–5 choices per decision, recommendations, rationales, and freeform support. After the frontier is empty, use confirmation mode with an explicit summary; it offers only Confirm shared understanding or Return to grilling.",
		parameters: GRILL_ASK_ROUND_PARAMETERS,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
			executeGrillAskRound(params, ctx),
	});
}

/** Keep the round tool inactive until an explicit structured-grill command starts an attempt. */
function registerGrillRoundStartupDeactivation(pi: ExtensionAPI): void {
	if (!isSessionLifecycleHost(pi)) return;
	pi.on("session_start", () => deactivateGrillAskRoundTool(pi));
}

interface SessionLifecycleHost {
	on(event: "session_start", handler: () => void): void;
}

function isSessionLifecycleHost(value: unknown): value is SessionLifecycleHost {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { on?: unknown }).on === "function"
	);
}

export default registerGrillUiExtension;

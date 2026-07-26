import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import {
	GRILL_ASK_TOOL_NAME,
	GRILL_UI_COMMAND_NAME,
	GRILL_WITH_DOCS_UI_COMMAND_NAME,
	deactivateGrillAskTool,
} from "@nseng-ai/pi-runtime/grill/surfaces";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";

import { executeGrillAsk } from "./execution.ts";
import type { ExtensionAPI } from "./protocol.ts";
import { handleGrillUiCommand, handleGrillWithDocsUiCommand } from "./runtime.ts";
import { registerGrillStatusLifecycle } from "./status.ts";
import { GRILL_ASK_PARAMETERS } from "./validate.ts";

export { executeGrillAsk } from "./execution.ts";
export {
	GRILL_UI_CONTRACT,
	buildGrillAskSelectTitle,
	buildGrillUiPrompt,
	buildGrillWithDocsUiPrompt,
} from "./prompts.ts";
export type {
	ExtensionAPI,
	GrillAskCustomComponent,
	GrillAskExecutionOptions,
	GrillAskInput,
	GrillAskOption,
	GrillAskRecommendation,
	GrillAskRemainingEstimate,
	GrillAskToolContext,
	GrillAskUiRunner,
	GrillUiCommandContext,
	NormalizedGrillAskInput,
	ToolDefinition,
	ToolResult,
} from "./protocol.ts";
export { type GrillAskDetails } from "./result.ts";
export { handleGrillUiCommand, handleGrillWithDocsUiCommand } from "./runtime.ts";
export {
	GRILL_ASK_PARAMETERS,
	RESERVED_GRILL_ASK_VALUES,
	validateGrillAskInput,
	type GrillAskValidationResult,
} from "./validate.ts";

export {
	GRILL_ASK_TOOL_NAME,
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
	registerGrillAskStartupDeactivation(pi);

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
		name: GRILL_ASK_TOOL_NAME,
		label: "Grill Ask",
		description:
			"Ask exactly one grill-me question through a structured UI with explicit answer choices, an optional recommendation/rationale, an honest remaining-question estimate, and first-class freeform, status checkpoint, and end-session paths.",
		parameters: GRILL_ASK_PARAMETERS,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) =>
			executeGrillAsk(params, ctx, signal === undefined ? {} : { signal }),
	});
}

/**
 * Make `grill_ask` inactive at each session start (new, resumed, forked, or reloaded).
 * The tool stays catalog-registered; an explicit structured-grill command activates it
 * for the remainder of the session. Removing only `grill_ask` preserves every other
 * extension's active-tool choices.
 */
function registerGrillAskStartupDeactivation(pi: ExtensionAPI): void {
	if (!isSessionLifecycleHost(pi)) return;
	pi.on("session_start", () => deactivateGrillAskTool(pi));
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

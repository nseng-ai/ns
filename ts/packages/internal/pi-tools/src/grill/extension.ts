import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import {
	GRILL_ASK_TOOL_NAME,
	GRILL_RETURN_COMMAND_NAME,
	GRILL_SIDEQUEST_COMMAND_NAME,
	GRILL_UI_COMMAND_NAME,
	GRILL_WITH_DOCS_UI_COMMAND_NAME,
} from "@nseng-ai/pi/grill/surfaces";
import { definePiSurfaceParity } from "@nseng-ai/pi/parity/extension";

import { executeGrillAsk } from "./execution.ts";
import type { ExtensionAPI } from "./protocol.ts";
import { handleGrillUiCommand, handleGrillWithDocsUiCommand } from "./runtime.ts";
import { isSidequestCapableHost, registerGrillSidequest } from "./sidequest/register.ts";
import { GRILL_ASK_PARAMETERS } from "./validate.ts";

export { executeGrillAsk } from "./execution.ts";
export {
	FALLBACK_GRILL_UI_SKILL_BLOCK,
	FALLBACK_GRILL_WITH_DOCS_UI_SKILL_BLOCK,
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
	GRILL_RETURN_COMMAND_NAME,
	GRILL_SIDEQUEST_COMMAND_NAME,
	GRILL_UI_COMMAND_NAME,
	GRILL_UI_SKILL_NAME,
	GRILL_WITH_DOCS_UI_COMMAND_NAME,
	GRILL_WITH_DOCS_UI_SKILL_NAME,
} from "@nseng-ai/pi/grill/surfaces";

export { isSidequestCapableHost, registerGrillSidequest } from "./sidequest/register.ts";

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
	{
		kind: "command",
		surface: GRILL_SIDEQUEST_COMMAND_NAME,
		workflow: "Start a grill side quest before answering the pending question",
		parity: "WAIVED",
		fallback:
			"Outside Pi, explore the tangent inline in the conversation, then re-ask the pending grill question.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@internal/pi-tools/grill",
		sourceModule: "grill-ui",
		notes: "Pi-native session-tree mark/return workflow; portable harnesses lack tree navigation.",
	},
	{
		kind: "command",
		surface: GRILL_RETURN_COMMAND_NAME,
		workflow: "Return from a grill side quest to the marked pending question",
		parity: "WAIVED",
		fallback: "Outside Pi, summarize the tangent inline and re-ask the pending grill question.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@internal/pi-tools/grill",
		sourceModule: "grill-ui",
		notes: "Pi-native session-tree mark/return workflow; portable harnesses lack tree navigation.",
	},
] as const);

export function registerGrillUiExtension(pi: ExtensionAPI): void {
	const sidequest = isSidequestCapableHost(pi) ? registerGrillSidequest(pi) : undefined;

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
			"Ask exactly one grill-me question through a structured UI with explicit answer choices, an optional recommendation/rationale, an honest remaining-question estimate, a freeform path, a status checkpoint path, and an end-session path.",
		promptSnippet:
			"Ask one grill-me question through structured choices, freeform, status, or end-session UI",
		promptGuidelines: [
			"Use grill_ask for each user-facing question in grill-me sessions; do not ask those questions in prose while grill_ask is available.",
			"Ask exactly one question per grill_ask call and include 2–5 affirmative, mutually exclusive options plus your recommendation.",
			"Include estimatedRemaining on every grill_ask call; use exact only when known, otherwise use a range with basis or unknown with basis.",
			"Use grill_ask with freeform and end-session paths enabled unless there is a strong reason not to.",
			"Do not ask routine validation-scope or test-coverage questions; defer ordinary validation coverage to the implementing agent unless validation is itself a product/design requirement, release gate, or user-visible compatibility promise.",
			'If grill_ask returns action: "end-grill", stop asking questions and summarize decisions, unresolved branches, and final recommendation.',
			'If grill_ask returns action: "status-request", use the requested status-report format, then call grill_ask again with the same pending question; do not treat the status request as an answer.',
			'If grill_ask returns action: "ui-unavailable", ask the same one question normally with numbered choices, including Other/freeform, Show current grill status, and End grilling session when applicable.',
			'If grill_ask returns action: "side-quest" or "side-quest-refused", follow the result text: a side quest pauses the interview and is never an answer; do not call grill_ask again until the side quest returns.',
		],
		parameters: GRILL_ASK_PARAMETERS,
		execute: async (toolCallId, params, signal, _onUpdate, ctx) =>
			executeGrillAsk(params, ctx, {
				...(signal === undefined ? {} : { signal }),
				toolCallId,
				...(sidequest === undefined ? {} : { onSideQuestStarted: sidequest.onSideQuestStarted }),
			}),
	});
}

export default registerGrillUiExtension;

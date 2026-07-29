import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";

import {
	HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME,
	HERDR_SESSION_SPACE_IMPL_COMMAND_NAME,
} from "../core/command-surfaces.ts";
import type { HerdrPiContext } from "./context.ts";

const SUMMARY_REQUEST_SENTINEL =
	"Draft a directed, self-contained implementation prompt for another coding-agent session.";

const SYSTEM_PROMPT = `${SUMMARY_REQUEST_SENTINEL}

Use the current session context and the continuation focus below. The prompt must let a fresh agent implement the requested continuation without access to this conversation. Capture the goal, relevant repository and branch state, decisions and constraints, work already completed, concrete file or symbol anchors, remaining steps, validation expectations, and material risks or unknowns. Distinguish verified facts from assumptions. Omit conversational filler. Do not use tools or perform implementation work. Return only the implementation prompt; do not wrap it in a slash command or a code fence.`;

export function registerHerdrSessionSpaceImplCommand(
	context: Pick<HerdrPiContext, "commands">,
): void {
	let summaryPending = false;

	context.commands.on("agent_end", (event, ctx) => {
		if (!summaryPending) return;
		const messages = readAgentEndMessages(event);
		if (!isSummaryRequestTurn(messages)) return;
		summaryPending = false;
		ctx.ui.setStatus?.(HERDR_SESSION_SPACE_IMPL_COMMAND_NAME, undefined);
		const summary = extractLatestAssistantText(messages);
		if (summary === undefined) {
			ctx.ui.notify("The session summary turn returned no implementation prompt.", "error");
			return;
		}
		if (ctx.ui.setEditorText === undefined) {
			ctx.ui.notify("This Pi runtime cannot prefill editor text.", "error");
			return;
		}
		ctx.ui.setEditorText(`/${HERDR_PROMPT_SPACE_IMPL_COMMAND_NAME} ${summary}`);
		ctx.ui.notify(
			"Drafted the session implementation prompt in the editor. Review or edit it, then press Enter.",
			"info",
		);
	});

	registerCommandWithImmediateAck({
		host: context.commands,
		commandName: HERDR_SESSION_SPACE_IMPL_COMMAND_NAME,
		commandDefinition: {
			description: "Draft the current session as a prompt for implementation in a new space.",
			argumentHint: "[focus]",
			handler: async (args, ctx) => {
				await ctx.waitForIdle();
				if (ctx.ui.setEditorText === undefined) {
					ctx.ui.notify("This Pi runtime cannot prefill editor text.", "error");
					return;
				}
				summaryPending = true;
				ctx.ui.setStatus?.(HERDR_SESSION_SPACE_IMPL_COMMAND_NAME, "summarizing session…");
				context.commands.sendUserMessage(buildSummaryRequest(args.trim()));
			},
		},
		options: { delivery: "message" },
	});
}

function buildSummaryRequest(focus: string): string {
	return [
		SYSTEM_PROMPT,
		"",
		"## Continuation focus",
		focus === "" ? "Choose the most natural implementation continuation from the session." : focus,
	].join("\n");
}

interface AgentMessageLike {
	readonly role?: string;
	readonly content?: unknown;
}

/**
 * True when the ended agent turn was responding to our summary request.
 *
 * Without this check, any agent turn that ends while a summary is pending —
 * an unrelated user message or another extension's turn — would be captured
 * as the implementation prompt.
 */
function isSummaryRequestTurn(messages: readonly AgentMessageLike[]): boolean {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role !== "user") continue;
		return extractUserText(message).startsWith(SUMMARY_REQUEST_SENTINEL);
	}
	return false;
}

function extractUserText(message: AgentMessageLike): string {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content
		.filter(
			(part): part is { type: "text"; text: string } =>
				typeof part === "object" &&
				part !== null &&
				"type" in part &&
				part.type === "text" &&
				"text" in part &&
				typeof part.text === "string",
		)
		.map((part) => part.text)
		.join("\n");
}

function readAgentEndMessages(event: unknown): readonly AgentMessageLike[] {
	if (typeof event !== "object" || event === null || !("messages" in event)) return [];
	if (!Array.isArray(event.messages)) return [];
	return event.messages.filter(isAgentMessageLike);
}

function isAgentMessageLike(value: unknown): value is AgentMessageLike {
	return typeof value === "object" && value !== null;
}

function extractLatestAssistantText(messages: readonly AgentMessageLike[]): string | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		const text = message.content
			.filter(
				(part): part is { type: "text"; text: string } =>
					typeof part === "object" &&
					part !== null &&
					"type" in part &&
					part.type === "text" &&
					"text" in part &&
					typeof part.text === "string",
			)
			.map((part) => part.text)
			.join("\n")
			.trim();
		if (text !== "") return text;
	}
	return undefined;
}

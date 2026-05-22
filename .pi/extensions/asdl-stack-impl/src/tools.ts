import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { PendingCloseouts, StackSliceBlockedPayload, StackSliceDonePayload } from "./closeout.ts";

const doneSchema = Type.Object({
	summary: Type.String({ description: "Concise summary of completed slice work." }),
	validation: Type.String({ description: "Validation command(s) and result summary." }),
	handoff_markdown: Type.String({ description: "Markdown handoff artifact to store in Branch Memory." }),
	semantic_update_file: Type.Optional(
		Type.String({ description: "Objective Semantic Update file created or amended for this slice." }),
	),
	followups: Type.Optional(Type.Array(Type.String({ description: "Known follow-up or risk." }))),
});

const blockedSchema = Type.Object({
	reason: Type.String({ description: "Why the slice cannot be completed safely." }),
	attempted: Type.String({ description: "What was attempted before blocking." }),
	next_steps: Type.Optional(Type.String({ description: "Recommended recovery or next action." })),
});

export function registerStackSliceTools(pi: ExtensionAPI, pendingCloseouts: PendingCloseouts): void {
	pi.registerTool({
		name: "stack_impl_slice_done",
		label: "Stack Implementation Slice Done",
		description: "Signal that the current stack-impl slice is complete and provide a handoff draft.",
		promptSnippet: "Queue stack-impl slice closeout with an agent-drafted handoff",
		promptGuidelines: [
			"Use stack_impl_slice_done only after code, tests, Objective update, Graphite commit/amend, and a handoff draft are ready.",
			"When using stack_impl_slice_done, include validation evidence and a concise Markdown handoff draft; the extension derives branch and handoff keys.",
		],
		parameters: doneSchema,
		async execute(toolCallId, params) {
			const payload = params as StackSliceDonePayload;
			pendingCloseouts.set(toolCallId, payload);
			pi.sendUserMessage(`/stack-impl-closeout ${toolCallId}`, { deliverAs: "followUp" });
			return {
				content: [{ type: "text", text: "Queued /stack-impl-closeout for this completed stack slice." }],
				details: { queued: true, toolCallId, summary: payload.summary },
			};
		},
	});

	pi.registerTool({
		name: "stack_impl_slice_blocked",
		label: "Stack Implementation Slice Blocked",
		description: "Signal that the current stack-impl slice is blocked and should stop in v1.",
		promptSnippet: "Report that the current stack-impl slice is blocked",
		promptGuidelines: [
			"Use stack_impl_slice_blocked when the current stack-impl slice cannot be completed safely; it does not write a completion handoff.",
		],
		parameters: blockedSchema,
		async execute(_toolCallId, params) {
			const payload = params as StackSliceBlockedPayload;
			return {
				content: [
					{
						type: "text",
						text: `Stack slice blocked: ${payload.reason}\nAttempted: ${payload.attempted}${payload.next_steps ? `\nNext steps: ${payload.next_steps}` : ""}`,
					},
				],
				details: { blocked: true, ...payload },
			};
		},
	});
}

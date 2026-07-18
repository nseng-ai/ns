/**
 * Flow-local copy of the Pi side-session event vocabulary. This duplication is
 * accepted because context-profiler retains the internal pi-tools copy while
 * stack-view belongs to Flow; keeping either feature dependent on the other's
 * package would violate their ownership boundary.
 *
 * The discriminated union and mapper lower a raw {@link AgentSessionEvent} onto
 * the event stream consumed by stack-view's transcript reducer.
 *
 * The union is the superset of what the two consumers need: text deltas,
 * assistant-message end, auto-retry, and turn end are shared; tool execution
 * start/end are only reachable when the side-session is spawned with a non-empty
 * tool allowlist (interrogation). A tool-less consumer (compose) simply never
 * receives the tool variants and filters them out.
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** One event from a Pi side-session (the I/O half maps AgentSession events to these). */
export type SideSessionEvent =
	| { type: "assistant-delta"; text: string }
	| { type: "assistant-end" }
	| { type: "tool-start"; name: string; summary: string }
	| { type: "tool-end"; name: string; summary: string; isError: boolean }
	| { type: "retry"; attempt: number; maxAttempts: number; message: string }
	| { type: "turn-end" };

/**
 * Map a raw {@link AgentSessionEvent} onto the side-session event stream. Text
 * deltas, assistant-message end, tool execution start/end, auto-retry, and turn
 * end carry through; every other event maps to null. Tool events are only emitted
 * when the session was spawned with tools enabled.
 */
export function mapAgentSessionEvent(event: AgentSessionEvent): SideSessionEvent | null {
	switch (event.type) {
		case "message_update":
			if (event.assistantMessageEvent.type === "text_delta")
				return { type: "assistant-delta", text: event.assistantMessageEvent.delta };
			return null;
		case "message_end":
			return event.message.role === "assistant" ? { type: "assistant-end" } : null;
		case "tool_execution_start":
			return { type: "tool-start", name: event.toolName, summary: summarizeToolArgs(event.args) };
		case "tool_execution_end":
			return {
				type: "tool-end",
				name: event.toolName,
				summary: summarizeToolArgs(event.result),
				isError: event.isError,
			};
		case "auto_retry_start":
			return {
				type: "retry",
				attempt: event.attempt,
				maxAttempts: event.maxAttempts,
				message: event.errorMessage,
			};
		case "turn_end":
			return { type: "turn-end" };
		default:
			return null;
	}
}

export function summarizeToolArgs(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 119)}…` : value;
	try {
		const json = JSON.stringify(value);
		if (json === undefined) return "";
		return json.length > 120 ? `${json.slice(0, 119)}…` : json;
	} catch {
		return String(value);
	}
}

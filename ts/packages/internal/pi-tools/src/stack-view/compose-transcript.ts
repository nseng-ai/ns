/**
 * Pure, immutable transcript reducer for the stack-view compose side-session.
 * Every function returns a fresh {@link ComposeTranscriptState}; none mutates
 * its input. The controller (I/O half) maps `AgentSession` events onto
 * {@link ComposeSessionEvent} and folds them in here. This module performs no
 * I/O, reads no clock, and emits no ANSI.
 *
 * Streaming state is controller-owned: `assistant-end` and `turn-end` are
 * explicit no-ops on the entry list, and `isStreaming` is toggled only via
 * {@link setStreaming}.
 */

/** One event from the compose side-session (the I/O half maps AgentSession events to these). */
export type ComposeSessionEvent =
	| { type: "assistant-delta"; text: string }
	| { type: "assistant-end" }
	| { type: "retry"; attempt: number; maxAttempts: number; message: string }
	| { type: "turn-end" };

export interface ComposeTranscriptEntry {
	kind: "user" | "assistant" | "notice";
	text: string;
}

export interface ComposeTranscriptState {
	entries: readonly ComposeTranscriptEntry[];
	isStreaming: boolean;
}

export const EMPTY_COMPOSE_TRANSCRIPT: ComposeTranscriptState = {
	entries: [],
	isStreaming: false,
};

export function appendUser(state: ComposeTranscriptState, text: string): ComposeTranscriptState {
	return { ...state, entries: [...state.entries, { kind: "user", text }] };
}

export function appendNotice(state: ComposeTranscriptState, text: string): ComposeTranscriptState {
	return { ...state, entries: [...state.entries, { kind: "notice", text }] };
}

/** Replace the text of the LAST notice entry, or append when the last entry is not a notice. */
export function replaceLastNotice(
	state: ComposeTranscriptState,
	text: string,
): ComposeTranscriptState {
	const last = state.entries.at(-1);
	if (last?.kind === "notice") {
		return { ...state, entries: [...state.entries.slice(0, -1), { kind: "notice", text }] };
	}
	return appendNotice(state, text);
}

export function setStreaming(
	state: ComposeTranscriptState,
	isStreaming: boolean,
): ComposeTranscriptState {
	return { ...state, isStreaming };
}

/** Reduce one session event into the transcript (delta appends to the last assistant entry or opens one; retry becomes a notice). */
export function applyComposeEvent(
	state: ComposeTranscriptState,
	event: ComposeSessionEvent,
): ComposeTranscriptState {
	switch (event.type) {
		case "assistant-delta":
			return appendAssistantDelta(state, event.text);
		case "assistant-end":
			return state;
		case "retry":
			return appendNotice(
				state,
				`retrying (${event.attempt}/${event.maxAttempts}): ${event.message}`,
			);
		case "turn-end":
			return state;
	}
}

/** Replace the LAST assistant entry's text (used to strip the draft block after assistant-end). */
export function replaceLastAssistantText(
	state: ComposeTranscriptState,
	text: string,
): ComposeTranscriptState {
	const index = state.entries.findLastIndex((entry) => entry.kind === "assistant");
	if (index === -1) return state;
	const entries = [...state.entries];
	entries[index] = { kind: "assistant", text };
	return { ...state, entries };
}

/** Text of the last assistant entry, or null. */
export function lastAssistantText(state: ComposeTranscriptState): string | null {
	const found = state.entries.findLast((entry) => entry.kind === "assistant");
	return found?.text ?? null;
}

function appendAssistantDelta(state: ComposeTranscriptState, text: string): ComposeTranscriptState {
	const last = state.entries.at(-1);
	if (last?.kind === "assistant") {
		return {
			...state,
			entries: [...state.entries.slice(0, -1), { kind: "assistant", text: `${last.text}${text}` }],
		};
	}
	return { ...state, entries: [...state.entries, { kind: "assistant", text }] };
}

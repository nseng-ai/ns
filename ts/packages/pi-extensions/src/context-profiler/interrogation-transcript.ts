import type { InterrogationEvent } from "./interrogation-session.ts";

export type TranscriptEntry =
	| { type: "user"; text: string }
	| { type: "assistant"; text: string }
	| { type: "tool"; name: string; status: "start" | "end"; summary: string }
	| { type: "notice"; text: string };

export interface TranscriptState {
	entries: TranscriptEntry[];
	isStreaming: boolean;
}

export function createTranscript(): TranscriptState {
	return { entries: [], isStreaming: false };
}

export function appendUser(state: TranscriptState, text: string): TranscriptState {
	return { ...state, entries: [...state.entries, { type: "user", text }] };
}

export function setStreaming(state: TranscriptState, isStreaming: boolean): TranscriptState {
	return { ...state, isStreaming };
}

export function appendNotice(state: TranscriptState, text: string): TranscriptState {
	return { ...state, entries: [...state.entries, { type: "notice", text }] };
}

export function applyInterrogationEvent(
	state: TranscriptState,
	event: InterrogationEvent,
): TranscriptState {
	switch (event.type) {
		case "assistant-delta":
			return appendAssistantDelta(state, event.text);
		case "assistant-end":
			return state;
		case "tool-start":
			return {
				...state,
				entries: [
					...state.entries,
					{ type: "tool", name: event.name, status: "start", summary: event.summary },
				],
			};
		case "tool-end":
			return {
				...state,
				entries: [
					...state.entries,
					{ type: "tool", name: event.name, status: "end", summary: event.summary },
				],
			};
		case "retry":
			return appendNotice(state, `retry ${event.attempt}/${event.maxAttempts}: ${event.message}`);
		case "turn-end":
			return state;
	}
}

function appendAssistantDelta(state: TranscriptState, text: string): TranscriptState {
	const last = state.entries.at(-1);
	if (last?.type === "assistant") {
		return {
			...state,
			entries: [...state.entries.slice(0, -1), { ...last, text: `${last.text}${text}` }],
		};
	}
	return { ...state, entries: [...state.entries, { type: "assistant", text }] };
}

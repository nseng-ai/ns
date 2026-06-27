import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { InterrogationScope } from "./interrogation-prompt.ts";
import { scopeLabel } from "./interrogation-prompt.ts";
import type { TranscriptEntry, TranscriptState } from "./interrogation-transcript.ts";
import { clamp } from "./render.ts";

export interface ChatLine {
	role: "user" | "assistant" | "tool" | "notice";
	text: string;
}

export function buildChatLines(state: TranscriptState, width: number): ChatLine[] {
	const lines = state.entries.flatMap((entry): ChatLine[] => linesForEntry(entry, width));
	if (state.isStreaming) {
		const last = lines.at(-1);
		if (last?.role === "assistant") {
			return [...lines.slice(0, -1), { ...last, text: appendCursor(last.text, width) }];
		}
		return [...lines, { role: "assistant", text: "agent: ▌" }];
	}
	return lines;
}

function linesForEntry(entry: TranscriptEntry, width: number): ChatLine[] {
	const prefix = prefixForEntry(entry);
	const text = textForEntry(entry);
	const available = Math.max(8, width - visibleWidth(prefix));
	const wrapped = wrapTextWithAnsi(text.length === 0 ? " " : text, available);
	return wrapped.map(
		(line, index): ChatLine => ({
			role: entry.type,
			text: `${index === 0 ? prefix : " ".repeat(visibleWidth(prefix))}${line}`,
		}),
	);
}

function prefixForEntry(entry: TranscriptEntry): string {
	switch (entry.type) {
		case "user":
			return "you: ";
		case "assistant":
			return "agent: ";
		case "tool":
			return entry.status === "start" ? `tool ${entry.name} › ` : `tool ${entry.name} ✓ `;
		case "notice":
			return "note: ";
	}
}

function textForEntry(entry: TranscriptEntry): string {
	switch (entry.type) {
		case "user":
		case "assistant":
		case "notice":
			return entry.text;
		case "tool":
			return entry.summary;
	}
}

function appendCursor(text: string, width: number): string {
	if (visibleWidth(text) + 2 <= width) return `${text} ▌`;
	return `${truncateToWidth(text, Math.max(1, width - 2), "…", true)} ▌`;
}

export function chatScrollWindow(options: {
	lines: readonly ChatLine[];
	height: number;
	scrollFromBottom: number;
}): { first: number; lines: ChatLine[]; scrollFromBottom: number } {
	const height = Math.max(1, options.height);
	const maxScrollFromBottom = Math.max(0, options.lines.length - height);
	const scrollFromBottom = clamp(options.scrollFromBottom, 0, maxScrollFromBottom);
	const first = Math.max(0, options.lines.length - height - scrollFromBottom);
	return { first, lines: options.lines.slice(first, first + height), scrollFromBottom };
}

export function chatFrameMeta(options: {
	ordinal: number | null;
	scope: InterrogationScope;
}): string {
	const ordinal =
		options.ordinal === null ? "interrogation unavailable" : `bundle #${options.ordinal}`;
	return `${ordinal} · ${scopeLabel(options.scope)}`;
}

export function chatHint(options: { isStreaming: boolean; isDegraded: boolean }): string {
	if (options.isDegraded) return "interrogation unavailable · reason shown above · esc back";
	if (options.isStreaming) return "streaming · Ctrl+C abort · esc back";
	return "ask about frozen bundle · enter submit · esc back";
}

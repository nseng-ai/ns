import type { AgentSessionEvent, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import {
	Input,
	Key,
	matchesKey,
	truncateToWidth,
	type Component,
	type Focusable,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { GrillingMap } from "./grilling-map.ts";
import { shortenHome } from "./paths.ts";
import type { GrillingRoomRuntime } from "./child-session.ts";

interface TranscriptItem {
	role: "assistant" | "user" | "tool" | "system";
	text: string;
}

export type GrillingRoomUIResult = "exit";

export async function openGrillingRoomUI(
	ctx: ExtensionCommandContext,
	runtime: GrillingRoomRuntime,
	kickoffPrompt?: string,
): Promise<GrillingRoomUIResult> {
	return ctx.ui.custom<GrillingRoomUIResult>((tui, theme, _keybindings, done) => {
		return new GrillingRoomComponent(runtime, theme, tui, done, kickoffPrompt);
	});
}

class GrillingRoomComponent implements Component, Focusable {
	private readonly input = new Input();
	private readonly transcript: TranscriptItem[] = [];
	private readonly unsubscribe: () => void;
	private assistantStreamingItem: TranscriptItem | undefined;
	private disposed = false;
	private _focused = false;
	private status = "idle";

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	constructor(
		private readonly runtime: GrillingRoomRuntime,
		private readonly theme: Theme,
		private readonly tui: { requestRender: () => void },
		private readonly done: (result: GrillingRoomUIResult) => void,
		kickoffPrompt?: string,
	) {
		this.input.onSubmit = (value) => {
			void this.submitAnswer(value);
		};

		this.unsubscribe = runtime.session.subscribe((event) => this.handleSessionEvent(event));
		runtime.mapStore.onChange = () => this.requestRender();

		this.appendTranscript("system", `Artifacts: ${runtime.runDir}`);
		if (runtime.isResume) {
			this.appendTranscript("system", "Resumed existing Grilling Room session.");
		} else if (kickoffPrompt) {
			setTimeout(() => {
				if (!this.disposed) void this.startKickoff(kickoffPrompt);
			}, 0);
		}
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.ctrl("x")) || matchesKey(data, Key.ctrl("d")) || data === "\x18" || data === "\x04") {
			this.done("exit");
			return;
		}

		if (matchesKey(data, Key.escape)) {
			if (this.runtime.session.isStreaming) {
				this.appendTranscript("system", "Aborting current child turn…");
				void this.runtime.session.abort().catch((error: unknown) => {
					this.appendTranscript("system", `Abort failed: ${errorMessage(error)}`);
				});
			} else {
				this.appendTranscript("system", "No active child turn to abort. Ctrl+X exits the room.");
			}
			return;
		}

		this.input.handleInput(data);
		this.requestRender();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(40, width);
		const lines: string[] = [];
		const title = ` Grilling Room: ${this.runtime.topic} `;
		lines.push(this.border("╭", "╮", "─", safeWidth, title));
		lines.push(this.boxLine(`Session: ${this.shortSession()}  Status: ${this.currentStatus()}`, safeWidth));
		lines.push(this.boxLine(`Artifacts: ${shortenHome(this.runtime.runDir)}`, safeWidth));
		lines.push(this.border("├", "┤", "─", safeWidth));

		if (safeWidth >= 96) {
			lines.push(...this.renderWideBody(safeWidth));
		} else {
			lines.push(...this.renderStackedBody(safeWidth));
		}

		lines.push(this.border("├", "┤", "─", safeWidth));
		lines.push(this.boxLine("Answer editor — Enter send • Esc abort • Ctrl+X/Ctrl+D exit/report", safeWidth));
		for (const inputLine of this.input.render(Math.max(1, safeWidth - 4))) {
			lines.push(this.boxLine(inputLine, safeWidth));
		}
		lines.push(this.border("╰", "╯", "─", safeWidth));
		return lines.map((line) => truncateToWidth(line, safeWidth, ""));
	}

	invalidate(): void {
		this.input.invalidate();
	}

	dispose(): void {
		this.disposed = true;
		this.unsubscribe();
		if (this.runtime.mapStore.onChange) {
			this.runtime.mapStore.onChange = undefined;
		}
	}

	private async startKickoff(kickoffPrompt: string): Promise<void> {
		this.appendTranscript("system", "Starting Grilling Room child session…");
		try {
			await this.runtime.session.prompt(kickoffPrompt);
		} catch (error) {
			this.appendTranscript("system", `Kickoff failed: ${errorMessage(error)}`);
		}
	}

	private async submitAnswer(value: string): Promise<void> {
		const answer = value.trim();
		if (answer.length === 0) return;
		if (this.runtime.session.isStreaming) {
			this.appendTranscript("system", "Child is still streaming. Wait or press Esc to abort before sending an answer.");
			return;
		}

		this.input.setValue("");
		this.appendTranscript("user", answer);
		try {
			await this.runtime.session.prompt(answer);
		} catch (error) {
			this.appendTranscript("system", `Prompt failed: ${errorMessage(error)}`);
		}
	}

	private handleSessionEvent(event: AgentSessionEvent): void {
		switch (event.type) {
			case "agent_start":
				this.status = "thinking";
				break;
			case "agent_end":
				this.status = "idle";
				this.assistantStreamingItem = undefined;
				break;
			case "message_start":
				if (event.message.role === "assistant") {
					this.assistantStreamingItem = undefined;
				}
				break;
			case "message_update":
				this.handleMessageUpdate(event);
				break;
			case "message_end":
				this.handleMessageEnd(event);
				break;
			case "tool_execution_start":
				this.appendTranscript("tool", `→ ${event.toolName}`);
				break;
			case "tool_execution_end":
				this.appendTranscript("tool", `${event.isError ? "✗" : "✓"} ${event.toolName}`);
				break;
		}
		this.requestRender();
	}

	private handleMessageUpdate(event: Extract<AgentSessionEvent, { type: "message_update" }>): void {
		const update = event.assistantMessageEvent;
		if (update.type === "text_delta") {
			this.appendAssistantDelta(update.delta);
		}
	}

	private handleMessageEnd(event: Extract<AgentSessionEvent, { type: "message_end" }>): void {
		if (event.message.role !== "assistant") return;
		const text = extractAssistantText(event.message);
		if (!text.trim()) return;
		if (this.assistantStreamingItem?.text.trim()) {
			this.assistantStreamingItem = undefined;
			return;
		}
		this.appendTranscript("assistant", text);
		this.assistantStreamingItem = undefined;
	}

	private appendAssistantDelta(delta: string): void {
		if (!this.assistantStreamingItem) {
			this.assistantStreamingItem = { role: "assistant", text: "" };
			this.transcript.push(this.assistantStreamingItem);
		}
		this.assistantStreamingItem.text += delta;
		this.trimTranscript();
	}

	private appendTranscript(role: TranscriptItem["role"], text: string): void {
		this.transcript.push({ role, text });
		this.trimTranscript();
		this.requestRender();
	}

	private trimTranscript(): void {
		const overflow = this.transcript.length - 80;
		if (overflow > 0) this.transcript.splice(0, overflow);
	}

	private requestRender(): void {
		if (!this.disposed) this.tui.requestRender();
	}

	private renderWideBody(width: number): string[] {
		const innerWidth = width - 4;
		const leftWidth = Math.min(40, Math.floor(innerWidth * 0.38));
		const rightWidth = innerWidth - leftWidth - 3;
		const left = this.renderMapPanel(leftWidth);
		const right = this.renderTranscriptPanel(rightWidth);
		const rows = Math.max(left.length, right.length);
		const lines: string[] = [];
		for (let index = 0; index < rows; index += 1) {
			const leftLine = padAnsi(left[index] ?? "", leftWidth);
			const rightLine = padAnsi(right[index] ?? "", rightWidth);
			lines.push(`│ ${leftLine} │ ${rightLine} │`);
		}
		return lines;
	}

	private renderStackedBody(width: number): string[] {
		const innerWidth = width - 4;
		return [...this.renderMapPanel(innerWidth), "", ...this.renderTranscriptPanel(innerWidth)].map((line) =>
			this.boxLine(line, width),
		);
	}

	private renderMapPanel(width: number): string[] {
		const map = this.runtime.mapStore.map;
		const lines: string[] = [];
		lines.push(this.theme.fg("accent", this.theme.bold("Asked")));
		lines.push(...this.renderAsked(map, width));
		lines.push("");
		lines.push(this.theme.fg("accent", this.theme.bold("Current Question")));
		lines.push(...wrapOrMuted(map.currentQuestion ?? "(none yet)", width, this.theme));
		lines.push("");
		lines.push(this.theme.fg("accent", this.theme.bold("Upcoming")));
		lines.push(...this.renderProjected(map, width));
		return lines;
	}

	private renderAsked(map: GrillingMap, width: number): string[] {
		if (map.asked.length === 0) return [this.theme.fg("muted", "(none yet)")];
		return map.asked.slice(-10).flatMap((item, index) => {
			const ordinal = map.asked.length > 10 ? map.asked.length - 9 + index : index + 1;
			const status = item.status ? ` [${item.status}]` : "";
			return wrapTextWithAnsi(`${this.theme.fg("muted", `${ordinal}.`)} ${item.question}${status}`, width);
		});
	}

	private renderProjected(map: GrillingMap, width: number): string[] {
		if (map.projected.length === 0) return [this.theme.fg("muted", "(none yet)")];
		return map.projected.slice(0, 8).flatMap((item) => {
			const priority = item.priority ? this.theme.fg("dim", ` (${item.priority})`) : "";
			return wrapTextWithAnsi(`${this.theme.fg("muted", "-")} ${item.question}${priority}`, width);
		});
	}

	private renderTranscriptPanel(width: number): string[] {
		const lines: string[] = [];
		lines.push(this.theme.fg("accent", this.theme.bold("Transcript / Current Answer")));
		if (this.runtime.mapStore.map.currentQuestion) {
			lines.push(...wrapTextWithAnsi(this.theme.fg("warning", "Current: ") + this.runtime.mapStore.map.currentQuestion, width));
			lines.push("");
		}
		const recent = this.transcript.slice(-32);
		if (recent.length === 0) {
			lines.push(this.theme.fg("muted", "(waiting for child output)"));
			return lines;
		}
		for (const item of recent) {
			const prefix = this.formatPrefix(item.role);
			const text = item.text.trimEnd() || "…";
			lines.push(...wrapTextWithAnsi(`${prefix}${text}`, width));
		}
		return lines;
	}

	private formatPrefix(role: TranscriptItem["role"]): string {
		switch (role) {
			case "assistant":
				return this.theme.fg("success", "griller: ");
			case "user":
				return this.theme.fg("accent", "you: ");
			case "tool":
				return this.theme.fg("muted", "tool: ");
			case "system":
				return this.theme.fg("dim", "room: ");
		}
	}

	private currentStatus(): string {
		if (this.runtime.session.isStreaming) return "streaming";
		return this.status;
	}

	private shortSession(): string {
		return shortenHome(this.runtime.nativeSessionPath).split("/").slice(-2).join("/");
	}

	private border(left: string, right: string, fill: string, width: number, label?: string): string {
		if (!label) return left + fill.repeat(Math.max(0, width - 2)) + right;
		const cleanLabel = truncateToWidth(label, Math.max(0, width - 4), "");
		const remaining = Math.max(0, width - 2 - visibleWidth(cleanLabel));
		const before = Math.floor(remaining / 2);
		const after = remaining - before;
		return left + fill.repeat(before) + cleanLabel + fill.repeat(after) + right;
	}

	private boxLine(content: string, width: number): string {
		return `│ ${padAnsi(truncateToWidth(content, Math.max(0, width - 4), ""), Math.max(0, width - 4))} │`;
	}
}

function padAnsi(value: string, width: number): string {
	const padding = Math.max(0, width - visibleWidth(value));
	return value + " ".repeat(padding);
}

function wrapOrMuted(value: string, width: number, theme: Theme): string[] {
	return wrapTextWithAnsi(value, width).map((line) => (value.startsWith("(") ? theme.fg("muted", line) : line));
}

function extractAssistantText(message: Extract<AgentSessionEvent, { type: "message_end" }>["message"]): string {
	if (message.role !== "assistant") return "";
	return message.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

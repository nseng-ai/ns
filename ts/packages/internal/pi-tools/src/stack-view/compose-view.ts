import { Editor, Key, matchesKey } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
import { getSelectListTheme, type Theme } from "@earendil-works/pi-coding-agent";

import { fitToWidth } from "@nseng-ai/pi/terminal/layout";

import type { StackThemeColor } from "./format.ts";
import type { ComposeViewPort } from "./compose-controller.ts";
import { detachSubscription } from "./subscription.ts";
import {
	COMPOSE_ROLE_DISPLAY,
	composeBodyLayout,
	composeTranscriptWindow,
	draftLineCount,
	flattenComposeTranscript,
	type ComposeTranscriptLine,
} from "./compose-model.ts";

/** Rows the compose transcript scrolls per PgUp/PgDn press. */
const COMPOSE_PAGE_LINES = 8;

export const COMPOSE_FOOTER =
	"enter send · ctrl+y accept & inject · ctrl+c abort · pgup/pgdn scroll · esc back";

export type ComposeViewResult =
	| { type: "continue" }
	| { type: "back" }
	| { type: "inject"; draft: string };

export interface ComposeViewOptions {
	tui: TUI;
	theme: Theme;
	port: ComposeViewPort;
}

/** Compose-mode view state for the stack-view overlay. */
export class ComposeView {
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly port: ComposeViewPort;
	private editor: Editor | null;
	private hint: string | undefined;
	private scroll: number;
	private unsubscribe: (() => void) | undefined;

	constructor(options: ComposeViewOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.port = options.port;
		this.editor = null;
		this.hint = undefined;
		this.scroll = 0;
		this.unsubscribe = this.port.onChange(() => this.tui.requestRender());
	}

	renderHeaderLine(): string {
		const segments = [`compose · draft ${draftLineCount(this.port.draft)} lines`];
		if (this.hint !== undefined) segments.push(this.hint);
		if (this.port.unavailableReason !== null)
			segments.push(`unavailable: ${this.port.unavailableReason}`);
		return this.color("text", segments.join(" · "));
	}

	renderBody(width: number, bodyRows: number): string[] {
		const editor = this.ensureEditor();
		editor.disableSubmit = this.port.transcript.isStreaming || this.port.unavailableReason !== null;
		const editorLines = editor.render(width);
		const layout = composeBodyLayout({ bodyRows, editorRows: editorLines.length });

		const transcript = flattenComposeTranscript(this.port.transcript).map((line) =>
			this.colorizeComposeLine(line),
		);
		const window = composeTranscriptWindow({
			lines: transcript,
			width,
			rows: layout.transcriptRows,
			scrollFromBottom: this.scroll,
		});
		this.scroll = window.scrollFromBottom;
		const transcriptRows = padWindowRows({
			lines: window.lines,
			rows: layout.transcriptRows,
			width,
			shouldPadTop: true,
		});

		const separator = this.color("dim", "─".repeat(Math.max(1, width)));
		const editorRows = editorLines.map((line) => fitToWidth(line, width));
		const draftRows = this.renderDraftPane(width, layout.draftRows);

		const lines = [...transcriptRows, separator, ...editorRows, separator, ...draftRows];
		if (lines.length >= bodyRows) return lines.slice(lines.length - bodyRows);
		return [...lines, ...Array.from({ length: bodyRows - lines.length }, () => "")];
	}

	handleInput(data: string): ComposeViewResult {
		this.hint = undefined;
		if (matchesKey(data, Key.escape)) return { type: "back" };
		if (matchesKey(data, Key.ctrl("c"))) {
			void this.port.abortTurn();
			this.tui.requestRender();
			return { type: "continue" };
		}
		if (matchesKey(data, Key.ctrl("y"))) {
			const draft = this.port.draft;
			if (draft !== null && draft.trim().length > 0) return { type: "inject", draft };
			this.hint = "no draft yet";
			this.tui.requestRender();
			return { type: "continue" };
		}
		if (matchesKey(data, Key.pageUp)) {
			this.scrollTranscript(COMPOSE_PAGE_LINES);
			return { type: "continue" };
		}
		if (matchesKey(data, Key.pageDown)) {
			this.scrollTranscript(-COMPOSE_PAGE_LINES);
			return { type: "continue" };
		}
		this.ensureEditor().handleInput(data);
		this.tui.requestRender();
		return { type: "continue" };
	}

	dispose(): void {
		this.unsubscribe = detachSubscription(this.unsubscribe);
		this.editor = null;
	}

	private scrollTranscript(delta: number): void {
		this.scroll = Math.max(0, this.scroll + delta);
		this.tui.requestRender();
	}

	private ensureEditor(): Editor {
		if (this.editor !== null) return this.editor;
		const editor = new Editor(
			this.tui,
			{ borderColor: (value) => this.color("border", value), selectList: getSelectListTheme() },
			{ paddingX: 0 },
		);
		editor.onSubmit = (text) => {
			const trimmed = text.trim();
			if (trimmed.length === 0) return;
			editor.addToHistory(trimmed);
			editor.setText("");
			void this.port.send(trimmed);
			this.tui.requestRender();
		};
		this.editor = editor;
		return editor;
	}

	private renderDraftPane(width: number, draftRows: number): string[] {
		if (draftRows === 1) {
			const status = `draft: ${draftLineCount(this.port.draft)} lines · ctrl+y to inject`;
			return [fitToWidth(this.color("dim", status), width)];
		}
		const colored = (this.port.draft ?? "").split("\n").map((line) => this.color("text", line));
		const window = composeTranscriptWindow({
			lines: colored,
			width,
			rows: draftRows,
			scrollFromBottom: 0,
		});
		return padWindowRows({ lines: window.lines, rows: draftRows, width, shouldPadTop: false });
	}

	private colorizeComposeLine(line: ComposeTranscriptLine): string {
		return this.color(COMPOSE_ROLE_DISPLAY[line.role].color, line.text);
	}

	private color(color: StackThemeColor, value: string): string {
		return this.theme.fg(color, value);
	}
}

function padWindowRows(options: {
	lines: readonly string[];
	rows: number;
	width: number;
	shouldPadTop: boolean;
}): string[] {
	const pad = options.shouldPadTop ? Math.max(0, options.rows - options.lines.length) : 0;
	return Array.from({ length: options.rows }, (_unused, row) =>
		fitToWidth(options.lines[row - pad] ?? "", options.width),
	);
}

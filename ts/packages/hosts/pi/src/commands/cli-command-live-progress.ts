import type { ScheduledTimer } from "@nseng-ai/foundation/timers";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";

import { withSafePiUi, withSafePiUiValue } from "../kit/shared/safe-ui.ts";
import { unrefTimerScheduler } from "../kit/shared/timers.ts";
import { truncateDisplayLine } from "../kit/terminal/presentation.ts";
import { traceCliCommand } from "./cli-command-trace.ts";

const LIVE_PROGRESS_STATUS_ID = "ns-cli-command";
const LIVE_PROGRESS_WIDGET_ID = "ns-cli-command-output";
const LIVE_PROGRESS_INTERVAL_MS = 1_000;
const LIVE_PROGRESS_MAX_LINES = 8;
const LIVE_PROGRESS_WIDGET_OUTPUT_LINES = 1;
const LIVE_PROGRESS_MAX_LINE_CHARS = 100;

type OutputStreamName = "stdout" | "stderr";
type LiveProgressTarget = "none" | "status" | "widget";
type CommandWidgetPlacement = "aboveEditor" | "belowEditor";

interface LiveCommandProgressContext {
	hasUI?: boolean;
	ui: {
		setStatus?(key: string, value: string | undefined): void;
		setWidget?(
			key: string,
			value: string[] | undefined,
			options?: { placement?: CommandWidgetPlacement },
		): void;
	};
}

interface LiveCommandProgressOptions {
	cliName: string;
	commandName: string;
	piCommandName: string;
	argv: readonly string[];
}

interface LiveOutputLine {
	stream: OutputStreamName;
	text: string;
}

export class LiveCommandProgress {
	private readonly ctx: LiveCommandProgressContext;
	private readonly options: LiveCommandProgressOptions;
	private readonly startedAt = Date.now();
	private readonly target: LiveProgressTarget;
	private phase = "starting";
	private stdoutChars = 0;
	private stderrChars = 0;
	private stdoutPending = "";
	private stderrPending = "";
	private outputLines: LiveOutputLine[] = [];
	private lastStatusValue: string | undefined;
	private timer: ScheduledTimer | undefined;
	private isClosed = false;

	constructor(ctx: LiveCommandProgressContext, options: LiveCommandProgressOptions) {
		this.ctx = ctx;
		this.options = options;
		this.target = liveProgressTarget(ctx);
		traceCliCommand("live_progress_start", {
			commandName: options.commandName,
			piCommandName: options.piCommandName,
			sendMessageCalled: false,
			target: this.target,
		});

		if (this.target === "none") return;

		this.render();
		this.timer = unrefTimerScheduler.setInterval(() => {
			this.render();
		}, LIVE_PROGRESS_INTERVAL_MS);
	}

	setPhase(phase: string): void {
		this.phase = phase;
		this.render();
	}

	appendOutput(stream: OutputStreamName, text: string): void {
		if (text === "") return;

		if (stream === "stdout") {
			this.stdoutChars += text.length;
		} else {
			this.stderrChars += text.length;
		}
		this.recordOutput(stream, text);
		traceCliCommand("live_progress_output", {
			chunkChars: text.length,
			commandName: this.options.commandName,
			piCommandName: this.options.piCommandName,
			sendMessageCalled: false,
			stderrChars: this.stderrChars,
			stdoutChars: this.stdoutChars,
			stream,
			target: this.target,
		});
		this.render();
	}

	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		this.clearTimer();
		if (this.target !== "none") {
			this.runLiveUiUpdate(() => {
				this.ctx.ui.setStatus?.(LIVE_PROGRESS_STATUS_ID, undefined);
				this.ctx.ui.setWidget?.(LIVE_PROGRESS_WIDGET_ID, undefined);
			});
		}
		traceCliCommand("live_progress_stop", {
			commandName: this.options.commandName,
			elapsedMs: Date.now() - this.startedAt,
			piCommandName: this.options.piCommandName,
			sendMessageCalled: false,
			stderrChars: this.stderrChars,
			stdoutChars: this.stdoutChars,
			target: this.target,
		});
	}

	private render(): void {
		if (this.target === "none" || this.isClosed) return;

		const elapsed = formatElapsedMs(Date.now() - this.startedAt);
		this.runLiveUiUpdate(() => {
			this.renderStatus(elapsed);
			this.ctx.ui.setWidget?.(LIVE_PROGRESS_WIDGET_ID, this.widgetLines(elapsed), {
				placement: "aboveEditor",
			});
		});
	}

	private renderStatus(elapsed: string): void {
		if (this.target !== "status") return;

		const value = this.statusValue(elapsed);
		if (value === this.lastStatusValue) return;

		this.lastStatusValue = value;
		this.ctx.ui.setStatus?.(LIVE_PROGRESS_STATUS_ID, value);
	}

	private runLiveUiUpdate(action: () => void): void {
		const result = withSafePiUi(action);
		if (result.type === "ok") return;

		this.isClosed = true;
		this.clearTimer();
		traceCliCommand("live_progress_stale_context", {
			commandName: this.options.commandName,
			piCommandName: this.options.piCommandName,
			target: this.target,
		});
	}

	private clearTimer(): void {
		if (this.timer === undefined) return;
		this.timer.cancel();
		this.timer = undefined;
	}

	private statusValue(elapsed: string): string {
		return `/${this.options.piCommandName} ${this.phase} (${elapsed})`;
	}

	private widgetLines(elapsed: string): string[] {
		const lines = [
			`/${this.options.piCommandName} ${this.phase} (${elapsed} elapsed)`,
			`$ ${formatCommandForDisplay(this.options.cliName, this.options.argv)} · stdout ${this.stdoutChars}, stderr ${this.stderrChars}`,
		];
		const recentLines = this.recentOutputLines();
		if (recentLines.length === 0) {
			lines.push("No CLI output yet.");
			return lines.map((line) => truncateDisplayLine(line, LIVE_PROGRESS_MAX_LINE_CHARS));
		}

		const shownLines = recentLines.slice(-LIVE_PROGRESS_WIDGET_OUTPUT_LINES);
		const hiddenLineCount = recentLines.length - shownLines.length;
		if (hiddenLineCount > 0) {
			lines.push(
				`… ${hiddenLineCount} earlier recent CLI line${hiddenLineCount === 1 ? "" : "s"} hidden`,
			);
		}
		for (const line of shownLines) {
			lines.push(formatLiveOutputLine(line));
		}
		return lines.map((line) => truncateDisplayLine(line, LIVE_PROGRESS_MAX_LINE_CHARS));
	}

	private recordOutput(stream: OutputStreamName, text: string): void {
		const pending = stream === "stdout" ? this.stdoutPending : this.stderrPending;
		const parts = `${pending}${text.replace(/\r/g, "\n")}`.split("\n");
		const nextPending = parts.pop() ?? "";
		for (const line of parts) {
			this.outputLines.push({ stream, text: line });
		}
		if (stream === "stdout") {
			this.stdoutPending = nextPending;
		} else {
			this.stderrPending = nextPending;
		}
		this.outputLines = this.outputLines.slice(-LIVE_PROGRESS_MAX_LINES);
	}

	private recentOutputLines(): LiveOutputLine[] {
		const lines = [...this.outputLines];
		if (this.stdoutPending !== "") {
			lines.push({ stream: "stdout", text: this.stdoutPending });
		}
		if (this.stderrPending !== "") {
			lines.push({ stream: "stderr", text: this.stderrPending });
		}
		return lines.slice(-LIVE_PROGRESS_MAX_LINES);
	}
}

function liveProgressTarget(ctx: LiveCommandProgressContext): LiveProgressTarget {
	if (!ctx.hasUI) return "none";

	const result = withSafePiUiValue(() => {
		const hasStatus = ctx.ui.setStatus !== undefined;
		const hasWidget = ctx.ui.setWidget !== undefined;
		if (hasWidget) return "widget";
		if (hasStatus) return "status";
		return "none";
	});
	if (result.type === "stale-context") return "none";
	return result.value;
}

function formatCommandForDisplay(cliName: string, argv: readonly string[]): string {
	return [cliName, ...argv].map(formatDisplayArg).join(" ");
}

function formatDisplayArg(arg: string): string {
	if (/^[A-Za-z0-9_./:=@+-]+$/.test(arg)) return arg;
	return JSON.stringify(arg);
}

function formatLiveOutputLine(line: LiveOutputLine): string {
	return truncateDisplayLine(`${line.stream}: ${line.text}`, LIVE_PROGRESS_MAX_LINE_CHARS);
}

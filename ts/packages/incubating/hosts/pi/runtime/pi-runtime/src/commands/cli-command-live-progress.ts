import type { TimerScheduler } from "@nseng-ai/foundation/timers";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import {
	matrixProgressDisplayWidthChars,
	type ActiveOperation,
	isMatrixProgressEvent,
	type NsProgressMatrixEvent,
	type NsProgressPhaseEvent,
} from "@nseng-ai/sdk";
import {
	createProgressPhaseStateStore,
	type ProgressPhaseView,
} from "@nseng-ai/sdk/progress-phase-state";

import { spinnerFrameAt } from "../kit/shared/spinner-frames.ts";
import { unrefTimerScheduler } from "../kit/shared/timers.ts";
import {
	createLiveProgressSink,
	resolveLiveProgressTarget,
	type LiveCommandProgressContext,
	type LiveProgressSink,
	type LiveProgressTarget,
} from "./cli-command-live-progress-sink.ts";
import { traceCliCommand } from "./cli-command-trace.ts";
import type {
	LiveProgressDisplaySnapshot,
	LiveProgressOutputLine,
	MatrixProgressCellSnapshot,
	MatrixProgressDisplaySnapshot,
	MatrixProgressRowSnapshot,
	StructuredProgressDisplaySnapshot,
} from "./cli-command-live-progress-widget.ts";

const LIVE_PROGRESS_MAX_LINES = 8;
const MATRIX_DEFAULT_LABEL_HEADER = "Branch / PR";

type OutputStreamName = "stdout" | "stderr";

interface LiveCommandProgressOptions {
	readonly cliName: string;
	readonly commandName: string;
	readonly piCommandName: string;
	readonly argv: readonly string[];
	readonly timers?: TimerScheduler;
	readonly onUnexpectedRenderRequestError?: (error: unknown) => void;
}

interface MatrixWidgetColumn {
	readonly key: string;
	readonly label: string;
	readonly width: number;
}

interface MatrixWidgetCell {
	readonly state: MatrixProgressCellSnapshot["state"];
	readonly text?: string;
}

class StructuredPhaseState {
	private readonly store = createProgressPhaseStateStore({ unknownKeyPolicy: "append" });
	private hasEvents = false;

	apply(event: Exclude<NsProgressPhaseEvent, NsProgressMatrixEvent>): void {
		this.hasEvents = true;
		this.store.apply(event);
	}

	snapshot(): StructuredProgressDisplaySnapshot {
		return {
			isActive: this.hasEvents,
			title: this.store.title(),
			phases: this.store.views().map(copyProgressPhaseView),
		};
	}
}

/** Mutable collector for matrix events with a defensive immutable snapshot seam. */
export class MatrixWidgetState {
	private columns: MatrixWidgetColumn[] = [];
	private labelHeader = MATRIX_DEFAULT_LABEL_HEADER;
	private rows: { rowKey: string; label: string }[] = [];
	private cellsByRow = new Map<string, Map<string, MatrixWidgetCell>>();
	private activeOperations: readonly ActiveOperation[] = [];
	private hasDeclared = false;

	apply(event: NsProgressMatrixEvent): void {
		switch (event.type) {
			case "matrix-declared":
				this.hasDeclared = true;
				this.columns = event.columns.map((column) => ({
					key: column.key,
					label: column.label,
					width: Math.max(column.width ?? 0, matrixProgressDisplayWidthChars(column.label)),
				}));
				if (event.labelHeader !== undefined) this.labelHeader = event.labelHeader;
				return;
			case "matrix-rows": {
				this.rows = event.rows.map((row) => ({ rowKey: row.rowKey, label: row.label }));
				const rowKeys = new Set(this.rows.map((row) => row.rowKey));
				for (const rowKey of this.cellsByRow.keys()) {
					if (!rowKeys.has(rowKey)) this.cellsByRow.delete(rowKey);
				}
				return;
			}
			case "matrix-cell": {
				const cells = this.cellsByRow.get(event.rowKey) ?? new Map<string, MatrixWidgetCell>();
				this.cellsByRow.set(event.rowKey, cells);
				cells.set(event.columnKey, {
					state: event.state,
					...(event.text === undefined ? {} : { text: event.text }),
				});
				return;
			}
			case "matrix-active-operations":
				this.activeOperations = event.operations.map((operation) => ({ ...operation }));
				return;
		}
	}

	snapshot(): MatrixProgressDisplaySnapshot {
		return {
			isActive: this.hasDeclared,
			labelHeader: this.labelHeader,
			columns: this.columns.map((column) => ({ ...column })),
			rows: this.rows.map((row) => this.snapshotRow(row)),
			activeOperations: this.activeOperations.map((operation) => ({ ...operation })),
		};
	}

	private snapshotRow(row: { rowKey: string; label: string }): MatrixProgressRowSnapshot {
		const cells = this.cellsByRow.get(row.rowKey);
		return {
			rowKey: row.rowKey,
			label: row.label,
			cells:
				cells === undefined ? [] : [...cells].map(([columnKey, cell]) => ({ columnKey, ...cell })),
		};
	}
}

export class LiveCommandProgress {
	private readonly options: LiveCommandProgressOptions;
	private readonly startedAt = Date.now();
	private readonly target: LiveProgressTarget;
	private readonly sink: LiveProgressSink;
	private phase = "starting";
	private stdoutChars = 0;
	private stderrChars = 0;
	private stdoutPending = "";
	private stderrPending = "";
	private outputLines: LiveProgressOutputLine[] = [];
	private readonly structuredProgress = new StructuredPhaseState();
	private readonly matrixProgress = new MatrixWidgetState();
	private isClosed = false;
	private hasTracedStaleContext = false;

	constructor(ctx: LiveCommandProgressContext, options: LiveCommandProgressOptions) {
		this.options = options;
		this.target = resolveLiveProgressTarget(ctx);
		traceCliCommand("live_progress_start", {
			commandName: options.commandName,
			piCommandName: options.piCommandName,
			sendMessageCalled: false,
			target: this.target,
		});
		this.sink = createLiveProgressSink({
			target: this.target,
			ctx,
			timers: options.timers ?? unrefTimerScheduler,
			getStatusValue: () => this.statusValue(),
			getDisplaySnapshot: (spinnerTick) => this.displaySnapshot(spinnerTick),
			onStaleContext: () => this.traceStaleContext(),
			onUnexpectedRenderRequestError:
				options.onUnexpectedRenderRequestError ??
				((error) => {
					traceCliCommand("live_progress_render_request_error", {
						commandName: options.commandName,
						error: formatErrorMessage(error),
						piCommandName: options.piCommandName,
						target: this.target,
					});
				}),
		});
	}

	setPhase(phase: string): void {
		this.phase = phase;
		this.sink.changed();
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
		this.sink.changed();
	}

	applyPhaseEvent(event: NsProgressPhaseEvent): void {
		if (isMatrixProgressEvent(event)) {
			this.matrixProgress.apply(event);
		} else {
			this.structuredProgress.apply(event);
		}
		this.sink.changed();
	}

	displaySnapshot(spinnerTick = 0): LiveProgressDisplaySnapshot {
		return {
			cliName: this.options.cliName,
			argv: [...this.options.argv],
			piCommandName: this.options.piCommandName,
			phase: this.phase,
			elapsed: formatElapsedMs(Date.now() - this.startedAt),
			stdoutChars: this.stdoutChars,
			stderrChars: this.stderrChars,
			recentOutputLines: this.recentOutputLines(),
			spinnerFrame: spinnerFrameAt(spinnerTick),
			structured: this.structuredProgress.snapshot(),
			matrix: this.matrixProgress.snapshot(),
		};
	}

	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		this.sink.close();
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

	private statusValue(): string {
		const elapsed = formatElapsedMs(Date.now() - this.startedAt);
		return `/${this.options.piCommandName} ${this.phase} (${elapsed})`;
	}

	private traceStaleContext(): void {
		if (this.hasTracedStaleContext) return;
		this.hasTracedStaleContext = true;
		traceCliCommand("live_progress_stale_context", {
			commandName: this.options.commandName,
			piCommandName: this.options.piCommandName,
			target: this.target,
		});
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

	private recentOutputLines(): LiveProgressOutputLine[] {
		const lines = this.outputLines.map((line) => ({ ...line }));
		if (this.stdoutPending !== "") {
			lines.push({ stream: "stdout", text: this.stdoutPending });
		}
		if (this.stderrPending !== "") {
			lines.push({ stream: "stderr", text: this.stderrPending });
		}
		return lines.slice(-LIVE_PROGRESS_MAX_LINES);
	}
}

function copyProgressPhaseView(phase: ProgressPhaseView): ProgressPhaseView {
	return {
		key: phase.key,
		name: phase.name,
		...(phase.detail === undefined ? {} : { detail: phase.detail }),
		state: phase.state,
		label: phase.label,
		history: [...phase.history],
		substeps: phase.substeps.map(copyProgressPhaseView),
	};
}

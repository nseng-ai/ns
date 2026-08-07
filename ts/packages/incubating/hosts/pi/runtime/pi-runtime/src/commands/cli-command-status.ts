import type { Clock } from "@nseng-ai/foundation/clock";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import { systemClock } from "@nseng-ai/foundation/time";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import {
	formatActiveOperation,
	isMatrixProgressEvent,
	type ActiveOperation,
	type NsProgressMatrixCellState,
	type NsProgressMatrixEvent,
	type NsProgressPhaseEvent,
} from "@nseng-ai/sdk";
import {
	createProgressPhaseStateStore,
	type ProgressPhaseView,
} from "@nseng-ai/sdk/progress-phase-state";

import { withSafePiUi, withSafePiUiValue } from "../kit/shared/safe-ui.ts";
import { spinnerFrameAt } from "../kit/shared/spinner-frames.ts";
import { unrefTimerScheduler } from "../kit/shared/timers.ts";
import { truncateDisplayLine } from "../kit/terminal/presentation.ts";
import { traceCliCommand } from "./cli-command-trace.ts";

const CLI_COMMAND_STATUS_ID = "ns-cli-command";
const HEARTBEAT_INTERVAL_MS = 1_000;
const ELAPSED_DISPLAY_THRESHOLD_MS = 5_000;
const STATUS_MAX_WIDTH_CHARS = 100;

const PROMPT_PHASES = new Set(["waiting for confirmation", "waiting for selection"]);

export interface CliCommandStatusContext {
	readonly hasUI?: boolean;
	readonly ui: { setStatus?(key: string, value: string | undefined): void };
}

export interface CliCommandStatusActivityOptions {
	readonly cliName: string;
	readonly commandName: string;
	readonly piCommandName: string;
	readonly timers?: TimerScheduler;
	readonly clock?: Clock;
}

class MatrixCounts {
	private columnKeys: readonly string[] = [];
	private rowKeys: readonly string[] = [];
	private cells = new Map<string, NsProgressMatrixCellState>();

	apply(event: NsProgressMatrixEvent): void {
		switch (event.type) {
			case "matrix-declared":
				this.columnKeys = event.columns.map((column) => column.key);
				this.rowKeys = [];
				this.cells.clear();
				return;
			case "matrix-rows":
				this.rowKeys = event.rows.map((row) => row.rowKey);
				this.retainDeclaredCells();
				return;
			case "matrix-cell":
				this.cells.set(cellKey(event.rowKey, event.columnKey), event.state);
				return;
			case "matrix-active-operations":
				return;
		}
	}

	summary(): { done: number; total: number } | undefined {
		const total = this.rowKeys.length * this.columnKeys.length;
		if (total === 0) return undefined;
		let done = 0;
		for (const rowKey of this.rowKeys) {
			for (const columnKey of this.columnKeys) {
				const state = this.cells.get(cellKey(rowKey, columnKey));
				if (state === "done" || state === "skipped") done += 1;
			}
		}
		return { done, total };
	}

	private retainDeclaredCells(): void {
		const validKeys = new Set(
			this.rowKeys.flatMap((rowKey) =>
				this.columnKeys.map((columnKey) => cellKey(rowKey, columnKey)),
			),
		);
		this.cells = new Map([...this.cells].filter(([key]) => validKeys.has(key)));
	}
}

export class CliCommandStatusActivity {
	private readonly ctx: CliCommandStatusContext;
	private readonly options: CliCommandStatusActivityOptions;
	private readonly timers: TimerScheduler;
	private readonly clock: Clock;
	private readonly startedAt: number;
	private readonly phaseStore = createProgressPhaseStateStore({ unknownKeyPolicy: "append" });
	private readonly matrixCounts = new MatrixCounts();
	private bridgePhase = "running CLI command";
	private failedPhaseName: string | undefined;
	private activeOperations: readonly ActiveOperation[] = [];
	private heartbeatTick = 0;
	private lastValue: string | undefined;
	private timer: ScheduledTimer | undefined;
	private isClosed = false;
	private readonly hasStatusTarget: boolean;

	constructor(ctx: CliCommandStatusContext, options: CliCommandStatusActivityOptions) {
		this.ctx = ctx;
		this.options = options;
		this.timers = options.timers ?? unrefTimerScheduler;
		this.clock = options.clock ?? systemClock;
		this.startedAt = this.clock.nowMs();
		this.hasStatusTarget = this.resolveStatusTarget();
		traceCliCommand("status_start", {
			cliName: options.cliName,
			commandName: options.commandName,
			piCommandName: options.piCommandName,
			target: this.hasStatusTarget ? "status" : "none",
		});
		if (!this.hasStatusTarget || this.isClosed) return;
		this.writeChanged();
		this.startTimer();
	}

	setPhase(phase: string): void {
		if (this.isClosed) return;
		const wasPrompt = this.isPromptOpen();
		this.bridgePhase = phase;
		const isPrompt = this.isPromptOpen();
		if (!wasPrompt && isPrompt) this.clearTimer();
		this.writeChanged();
		if (wasPrompt && !isPrompt) this.startTimer();
	}

	applyPhaseEvent(event: NsProgressPhaseEvent): void {
		if (this.isClosed) return;
		if (isMatrixProgressEvent(event)) {
			this.matrixCounts.apply(event);
			if (event.type === "matrix-active-operations") {
				this.activeOperations = event.operations;
			}
		} else {
			const changedPhase = this.phaseStore.apply(event);
			if (event.type === "phase-failed") {
				this.failedPhaseName = changedPhase?.name ?? event.phaseKey;
			} else if (event.type === "phase-started") {
				this.failedPhaseName = undefined;
			}
		}
		this.writeChanged();
	}

	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		this.clearTimer();
		if (this.hasStatusTarget) {
			const result = withSafePiUi(() => {
				this.ctx.ui.setStatus?.(CLI_COMMAND_STATUS_ID, undefined);
			});
			if (result.type === "stale-context") this.traceStaleContext();
		}
		traceCliCommand("status_stop", {
			cliName: this.options.cliName,
			commandName: this.options.commandName,
			elapsedMs: this.clock.nowMs() - this.startedAt,
			piCommandName: this.options.piCommandName,
			target: this.hasStatusTarget ? "status" : "none",
		});
	}

	private resolveStatusTarget(): boolean {
		if (!this.ctx.hasUI) return false;
		const result = withSafePiUiValue(() => this.ctx.ui.setStatus !== undefined);
		if (result.type === "stale-context") {
			this.detachForStaleContext();
			return false;
		}
		return result.value;
	}

	private startTimer(): void {
		if (this.isClosed || !this.hasStatusTarget || this.timer !== undefined || this.isPromptOpen()) {
			return;
		}
		this.timer = this.timers.setInterval(() => {
			this.heartbeatTick += 1;
			this.writeChanged();
		}, HEARTBEAT_INTERVAL_MS);
	}

	private writeChanged(): void {
		if (this.isClosed || !this.hasStatusTarget) return;
		const value = this.statusValue();
		if (value === this.lastValue) return;
		const result = withSafePiUi(() => {
			this.ctx.ui.setStatus?.(CLI_COMMAND_STATUS_ID, value);
		});
		if (result.type === "stale-context") {
			this.detachForStaleContext();
			return;
		}
		this.lastValue = value;
	}

	private statusValue(): string {
		const segments = [`${this.glyph()} /${this.options.piCommandName}`, ...this.textSegments()];
		const counts = this.matrixCounts.summary();
		if (counts !== undefined) segments.push(`${counts.done}/${counts.total}`);
		const operation = this.activeOperations[0];
		if (operation !== undefined)
			segments.push(sanitizeStatusText(formatActiveOperation(operation)));
		const elapsedMs = this.clock.nowMs() - this.startedAt;
		if (elapsedMs >= ELAPSED_DISPLAY_THRESHOLD_MS) segments.push(formatElapsedMs(elapsedMs));
		return truncateDisplayLine(segments.join(" · "), STATUS_MAX_WIDTH_CHARS);
	}

	private glyph(): string {
		if (this.isPromptOpen()) return "?";
		if (this.failedPhaseName !== undefined) return "✗";
		return spinnerFrameAt(this.heartbeatTick);
	}

	private textSegments(): string[] {
		if (this.isPromptOpen()) return [this.bridgePhase];
		if (this.bridgePhase === "waiting for Pi") return [this.bridgePhase];
		if (this.failedPhaseName !== undefined) {
			return [`${sanitizeStatusText(this.failedPhaseName)} failed`];
		}
		const activePhase = findActivePhase(this.phaseStore.views());
		if (activePhase === undefined) return ["running"];
		const segments = [sanitizeStatusText(activePhase.name)];
		if (activePhase.label !== undefined) segments.push(sanitizeStatusText(activePhase.label));
		return segments;
	}

	private isPromptOpen(): boolean {
		return PROMPT_PHASES.has(this.bridgePhase);
	}

	private detachForStaleContext(): void {
		this.isClosed = true;
		this.clearTimer();
		this.traceStaleContext();
	}

	private traceStaleContext(): void {
		traceCliCommand("status_stale_context", {
			commandName: this.options.commandName,
			piCommandName: this.options.piCommandName,
			target: this.hasStatusTarget ? "status" : "none",
		});
	}

	private clearTimer(): void {
		if (this.timer === undefined) return;
		this.timer.cancel();
		this.timer = undefined;
	}
}

function findActivePhase(phases: readonly ProgressPhaseView[]): ProgressPhaseView | undefined {
	for (const phase of phases) {
		const activeSubstep = phase.substeps.find((substep) => substep.state === "active");
		if (activeSubstep !== undefined) return activeSubstep;
		if (phase.state === "active") return phase;
	}
	return undefined;
}

function sanitizeStatusText(text: string): string {
	return stripTerminalEscapes(text).replace(/[\x00-\x1F\x7F]/g, "");
}

function cellKey(rowKey: string, columnKey: string): string {
	return `${rowKey}\u0000${columnKey}`;
}

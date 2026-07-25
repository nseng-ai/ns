import type { Caps } from "@nseng-ai/clinkr";
import {
	createStreamSink,
	type FrameRenderer,
	type StreamSink,
	type StreamSinkDeps,
} from "@nseng-ai/clinkr/stream";
import {
	bold,
	dim,
	ellipsisFor,
	padPlain,
	paint,
	spinnerFrame,
	statusLine,
	truncatePlain,
} from "@nseng-ai/foundation/cli-theme";
import type { Clock } from "@nseng-ai/foundation/clock";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { systemClock } from "@nseng-ai/foundation/time";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import {
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	formatActiveOperationsLine,
	matrixProgressDisplayWidthChars,
	type ActiveOperation,
} from "@nseng-ai/sdk";

import type { MatrixProgressAdapter } from "./matrix-progress-controller.ts";
import type {
	MatrixCellView,
	MatrixColumnSpec,
	MatrixProgressSnapshot,
	MatrixRowSpec,
	MatrixRowView,
} from "./matrix-progress-state.ts";
import { createPhaseStreamLifecycle } from "./phase-stream-lifecycle.ts";
import type { PhaseView } from "./phase-stream-state.ts";
import { createTranscriptTail } from "./phase-stream-tail.ts";

/** Quiet time before the tail line grows a "· Ns ago" counter; below this, output reads as flowing. */
export const TAIL_QUIET_NOTICE_MS = 3_000;

export interface CreateMatrixTerminalAdapterOptions<ColumnKey extends string> {
	caps: Caps;
	deps: StreamSinkDeps;
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	clock?: Clock;
}

export function createMatrixTerminalAdapter<ColumnKey extends string, Row extends MatrixRowSpec>(
	options: CreateMatrixTerminalAdapterOptions<ColumnKey>,
): MatrixProgressAdapter<ColumnKey, Row> {
	const sink = createStreamSink(options.caps, options.deps);
	const lifecycle = createPhaseStreamLifecycle(options.caps, sink);
	const tail = createTranscriptTail();
	const clock = options.clock ?? systemClock;
	let latest: MatrixProgressSnapshot<ColumnKey, Row> | undefined;
	let isSettled = false;
	let lastNoteAtMs: number | undefined;
	const renderer = createMatrixProgressRenderer({
		caps: options.caps,
		sink,
		columns: options.columns,
		getSnapshot: () => latest,
		phaseViews: () => latest?.phases ?? [],
		activeOperations: () => (isSettled ? undefined : latest?.activeOperations),
		tailLine: () => (isSettled ? undefined : (tail.line() ?? "")),
		tailSinceOutputMs: () =>
			isSettled || lastNoteAtMs === undefined
				? undefined
				: Math.max(0, clock.nowMs() - lastNoteAtMs),
	});

	return {
		begin: ({ snapshot }) => {
			latest = snapshot;
			lifecycle.startLiveRegion();
			renderer.render();
			lifecycle.startPump();
		},
		observe: (change, getSnapshot) => {
			if (change.kind === "note") {
				if (!options.caps.isTty) return;
				tail.note(change.text);
				lastNoteAtMs = clock.nowMs();
			} else {
				latest = getSnapshot();
			}
			renderer.render();
		},
		beforeFinish: () => lifecycle.drainPump(),
		finish: async (finishOptions) => {
			latest = finishOptions.snapshot;
			isSettled = true;
			tail.clear();
			renderer.render();
			sink.finish(finishOptions.finalLines);
			await lifecycle.stop();
		},
		stop: () => lifecycle.stop(),
	};
}

export interface MatrixFrameOptionalFields {
	/** Omit for a settled frame; an empty array reserves the operations slot on every live frame. */
	activeOperations?: readonly ActiveOperation[];
	/** Omit for a settled frame; an empty string reserves a blank tail slot before any output. */
	tailLine?: string;
	tailSinceOutputMs?: number;
	tick?: number;
}

export function renderMatrixProgressFrame<ColumnKey extends string>(
	input: {
		caps: Caps;
		title: string;
		columns: readonly MatrixColumnSpec<ColumnKey>[];
		phases?: readonly PhaseView[];
		rows: readonly MatrixRowView<ColumnKey>[];
		labelHeader?: string;
	} & MatrixFrameOptionalFields,
): readonly string[] {
	const tick = input.tick ?? 0;
	const operationsLine = formatActiveOperationsLine(input.activeOperations ?? []);
	const lines = [bold(input.title)];
	for (const phase of input.phases ?? []) {
		lines.push(renderPhaseLine({ caps: input.caps, phase, tick, indent: 0 }));
		for (const substep of phase.substeps) {
			lines.push(renderPhaseLine({ caps: input.caps, phase: substep, tick, indent: 4 }));
		}
	}
	if ((input.phases?.length ?? 0) > 0) lines.push("");
	lines.push(renderHeader(input.caps, input.columns, input.labelHeader ?? "Branch / PR"));
	for (const row of input.rows) {
		lines.push(renderMatrixRow({ caps: input.caps, columns: input.columns, row, tick }));
	}
	if (input.activeOperations !== undefined)
		lines.push(renderOperationsLine(input.caps, operationsLine));
	if (input.tailLine !== undefined) {
		lines.push(renderTailLine(input.caps, input.tailLine, input.tailSinceOutputMs));
	}
	return lines;
}

function createMatrixProgressRenderer<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
>(options: {
	caps: Caps;
	sink: StreamSink;
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	getSnapshot(): MatrixProgressSnapshot<ColumnKey, Row> | undefined;
	phaseViews(): readonly PhaseView[];
	activeOperations(): readonly ActiveOperation[] | undefined;
	tailLine(): string | undefined;
	tailSinceOutputMs(): number | undefined;
}): { render(): void } {
	const frame: FrameRenderer = (tick) => {
		const snapshot = options.getSnapshot();
		if (snapshot === undefined) return [];
		const activeOperations = options.activeOperations();
		const tailLine = options.tailLine();
		const tailSinceOutputMs = options.tailSinceOutputMs();
		return renderMatrixProgressFrame({
			caps: options.caps,
			title: snapshot.title,
			columns: options.columns,
			phases: options.phaseViews(),
			...optionalEntry("activeOperations", activeOperations),
			rows: snapshot.rows,
			...(tailLine === undefined ? {} : { tailLine }),
			...optionalEntry("tailSinceOutputMs", tailSinceOutputMs),
			tick,
		});
	};
	return { render: () => options.sink.render(frame) };
}

function renderOperationsLine(caps: Caps, operationsLine: string | undefined): string {
	if (operationsLine === undefined) return "";
	return dim(truncatePlain(operationsLine, caps.columns, ellipsisFor(caps)));
}

function renderTailLine(caps: Caps, tailLine: string, sinceOutputMs: number | undefined): string {
	if (tailLine === "") return "";
	const suffix =
		sinceOutputMs !== undefined && sinceOutputMs >= TAIL_QUIET_NOTICE_MS
			? ` · ${formatElapsedMs(sinceOutputMs)} ago`
			: "";
	const width = Math.max(0, caps.columns - 7 - suffix.length);
	return `       ${dim(`${truncatePlain(tailLine, width, ellipsisFor(caps))}${suffix}`)}`;
}

function renderPhaseLine(options: {
	caps: Caps;
	phase: PhaseView;
	tick: number;
	indent: number;
}): string {
	const prefix = " ".repeat(options.indent);
	const phaseCaps = {
		...options.caps,
		columns: Math.max(0, options.caps.columns - options.indent),
	};
	const item =
		options.phase.label === undefined
			? options.phase.item
			: { ...options.phase.item, label: options.phase.label };
	return `${prefix}${statusLine({
		caps: phaseCaps,
		item,
		state: options.phase.state,
		tick: options.tick,
	})}`;
}

function renderHeader<ColumnKey extends string>(
	caps: Caps,
	columns: readonly MatrixColumnSpec<ColumnKey>[],
	labelHeader: string,
): string {
	return dim(
		`${padPlain(labelHeader, labelWidth(caps))}  ${columns.map((column) => padPlain(column.label, column.width)).join("  ")}`,
	);
}

function renderMatrixRow<ColumnKey extends string>(options: {
	caps: Caps;
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	row: MatrixRowView<ColumnKey>;
	tick: number;
}): string {
	const label = padPlain(
		truncatePlain(options.row.label, labelWidth(options.caps), ellipsisFor(options.caps)),
		labelWidth(options.caps),
	);
	const cells = options.columns
		.map((column) =>
			centerMatrixProgressText(
				renderCell({
					caps: options.caps,
					cell: options.row.cells[column.key],
					tick: options.tick,
					width: column.width,
				}),
				column.width,
			),
		)
		.join("  ");
	return `${label}  ${cells}`;
}

function renderCell(options: {
	caps: Caps;
	cell: MatrixCellView;
	tick: number;
	width: number;
}): string {
	const text =
		options.cell.text !== undefined &&
		matrixProgressDisplayWidthChars(options.cell.text) <= options.width
			? options.cell.text
			: undefined;
	switch (options.cell.state) {
		case "pending":
			return dim(text ?? "·");
		case "active":
			return paint(options.caps, "accent", text ?? spinnerFrame(options.caps, options.tick));
		case "done":
			return text ?? "✓";
		case "skipped":
			return dim(text ?? "–");
		case "failed":
			return text === undefined ? "✗" : paint(options.caps, "error", text);
	}
}

function labelWidth(caps: Caps): number {
	return clampMatrixProgressLabelWidthChars(caps.columns - 44);
}

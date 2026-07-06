import type { Caps } from "@nseng-ai/clinkr";
import {
	createStreamSink,
	type StreamSink,
	type StreamSinkDeps,
	type FrameRenderer,
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
import type { NsProgress } from "@nseng-ai/kernel/sdk";

import { createPhaseStreamLifecycle } from "../phase-stream/phase-stream-lifecycle.ts";
import {
	CHECKPOINT_PHASES,
	SUBMIT_PHASES,
	type PhaseSpec,
} from "../phase-stream/phase-stream-specs.ts";
import { createTranscriptTail } from "../phase-stream/phase-stream-tail.ts";
import { prNumberFromUrl, type SubmitPrLink } from "./gt-output.ts";

export type SubmitMatrixCellState = "pending" | "active" | "done" | "skipped" | "failed";
export type SubmitMatrixColumnKey = "metadata" | "submit" | "verify" | "description";
export type SubmitMatrixGlobalKey = "inventory" | "checkpoint" | "preflight" | "restack";

export interface SubmitMatrixColumnSpec {
	key: SubmitMatrixColumnKey;
	label: string;
}

export interface SubmitMatrixRowSpec {
	branch: string;
	label: string;
	kind: "existing" | "new";
	pr?: SubmitPrLink;
}

export interface SubmitMatrixGlobalRowSpec {
	key: SubmitMatrixGlobalKey;
	label: string;
	detail: string;
	activeLabel: string;
	substeps?: readonly { key: string; label: string; detail: string; activeLabel: string }[];
}

export interface SubmitStackTopology {
	currentBranch: string;
	branches: readonly SubmitStackTopologyBranch[];
}

export interface SubmitStackTopologyBranch {
	branch: string;
	parentBranch: string;
	kind: "existing" | "new";
	pr?: SubmitPrLink;
}

export interface SubmitMatrixProgressSink {
	setRows(rows: readonly SubmitMatrixRowSpec[]): void;
	setGlobal(key: SubmitMatrixGlobalKey, state: SubmitMatrixCellState, text?: string): void;
	setGlobalSubstep(
		globalKey: SubmitMatrixGlobalKey,
		substepKey: string,
		state: SubmitMatrixCellState,
		text?: string,
	): void;
	setCell(
		branch: string,
		column: SubmitMatrixColumnKey,
		state: SubmitMatrixCellState,
		text?: string,
	): void;
	setAllCells(column: SubmitMatrixColumnKey, state: SubmitMatrixCellState, text?: string): void;
	setAllOtherCells(
		column: SubmitMatrixColumnKey,
		branch: string,
		state: SubmitMatrixCellState,
		text?: string,
	): void;
	applyPrLinks(prLinks: readonly SubmitPrLink[]): void;
}

export interface SubmitMatrixProgressController extends SubmitMatrixProgressSink {
	begin(): void;
	note(text: string): void;
	failActive(): void;
	finish(options?: { isFailed?: boolean; finalLines?: readonly string[] }): Promise<void>;
	stop(): Promise<void>;
}

interface MatrixCellView {
	state: SubmitMatrixCellState;
	text?: string;
}

interface MatrixRowView {
	branch: string;
	label: string;
	kind: "existing" | "new";
	pr?: SubmitPrLink;
	cells: Record<SubmitMatrixColumnKey, MatrixCellView>;
}

interface MatrixGlobalView {
	key: SubmitMatrixGlobalKey;
	label: string;
	detail: string;
	activeLabel: string;
	state: SubmitMatrixCellState;
	text?: string;
	substeps: MatrixGlobalSubstepView[];
}

interface MatrixGlobalSubstepView {
	key: string;
	label: string;
	detail: string;
	activeLabel: string;
	state: SubmitMatrixCellState;
	text?: string;
}

export const SUBMIT_MATRIX_COLUMNS: readonly SubmitMatrixColumnSpec[] = [
	{ key: "metadata", label: "Metadata" },
	{ key: "submit", label: "Submit" },
	{ key: "verify", label: "Verify" },
	{ key: "description", label: "Description" },
];

export const SUBMIT_MATRIX_GLOBAL_ROWS: readonly SubmitMatrixGlobalRowSpec[] = [
	{
		key: "inventory",
		label: "Inventory",
		detail: "stack inventoried",
		activeLabel: "reading submit stack topology…",
	},
	{
		key: "checkpoint",
		label: "Checkpoint",
		detail: "checkpoint complete",
		activeLabel: "checkpointing pending changes…",
		substeps: CHECKPOINT_PHASES.map((phase) => ({
			key: phase.key,
			label: phase.item.name,
			detail: phase.item.detail,
			activeLabel: phase.item.label ?? phase.item.detail,
		})),
	},
	{
		key: "preflight",
		label: "Preflight",
		detail: "ready to submit",
		activeLabel: "checking submit readiness…",
	},
	{
		key: "restack",
		label: "Restack",
		detail: "not required",
		activeLabel: "running gt restack…",
	},
];

export function submitMatrixRowsFromTopology(
	topology: SubmitStackTopology,
): readonly SubmitMatrixRowSpec[] {
	return topology.branches.map((branch) => ({
		branch: branch.branch,
		label: formatRowLabel(branch.branch, branch.pr),
		kind: branch.kind,
		...(branch.pr === undefined ? {} : { pr: branch.pr }),
	}));
}

export function createSubmitMatrixProgressController(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	title: string;
	rows: readonly SubmitMatrixRowSpec[];
	forward?: NsProgress;
}): SubmitMatrixProgressController {
	const sink = createStreamSink(options.caps, options.deps);
	const lifecycle = createPhaseStreamLifecycle(options.caps, sink);
	const tail = createTranscriptTail();
	const state = createSubmitMatrixState(options.rows);
	const renderer = createSubmitMatrixRenderer({
		caps: options.caps,
		sink,
		title: options.title,
		globals: () => state.globals,
		rows: () => state.rows,
		tailLine: tail.line,
	});
	const isForwarding = options.forward?.isLive === true;

	function render(): void {
		renderer.render();
	}

	function begin(): void {
		if (isForwarding) {
			options.forward?.phase({
				type: "phases-declared",
				title: options.title,
				phases: phaseInfos(SUBMIT_PHASES),
			});
		}
		lifecycle.startLiveRegion();
		render();
		lifecycle.startPump();
	}

	function setRows(rows: readonly SubmitMatrixRowSpec[]): void {
		state.rows = createSubmitMatrixRowViews(rows);
		render();
	}

	function setGlobal(
		key: SubmitMatrixGlobalKey,
		stateValue: SubmitMatrixCellState,
		text?: string,
	): void {
		const row = state.globals.find((global) => global.key === key);
		if (row === undefined) return;
		row.state = stateValue;
		if (text === undefined) delete row.text;
		else row.text = text;
		render();
	}

	function setGlobalSubstep(
		globalKey: SubmitMatrixGlobalKey,
		substepKey: string,
		stateValue: SubmitMatrixCellState,
		text?: string,
	): void {
		const row = state.globals.find((global) => global.key === globalKey);
		const substep = row?.substeps.find((item) => item.key === substepKey);
		if (substep === undefined) return;
		substep.state = stateValue;
		if (text === undefined) delete substep.text;
		else substep.text = text;
		render();
	}

	function setCell(
		branch: string,
		column: SubmitMatrixColumnKey,
		stateValue: SubmitMatrixCellState,
		text?: string,
	): void {
		const row = state.rows.find((item) => item.branch === branch);
		if (row === undefined) return;
		row.cells[column] = { state: stateValue, ...(text === undefined ? {} : { text }) };
		render();
	}

	function setAllCells(
		column: SubmitMatrixColumnKey,
		stateValue: SubmitMatrixCellState,
		text?: string,
	): void {
		for (const row of state.rows) {
			row.cells[column] = { state: stateValue, ...(text === undefined ? {} : { text }) };
		}
		render();
	}

	function setAllOtherCells(
		column: SubmitMatrixColumnKey,
		branch: string,
		stateValue: SubmitMatrixCellState,
		text?: string,
	): void {
		for (const row of state.rows) {
			if (row.branch === branch) continue;
			row.cells[column] = { state: stateValue, ...(text === undefined ? {} : { text }) };
		}
		render();
	}

	function applyPrLinks(prLinks: readonly SubmitPrLink[]): void {
		applyPrLinksToRows(state.rows, prLinks);
		render();
	}

	function note(text: string): void {
		if (!options.caps.isTty) return;
		tail.note(text);
		render();
	}

	function failActive(): void {
		for (const global of state.globals) {
			if (global.state === "active") global.state = "failed";
			for (const substep of global.substeps) {
				if (substep.state === "active") substep.state = "failed";
			}
		}
		for (const row of state.rows) {
			for (const column of SUBMIT_MATRIX_COLUMNS) {
				const cell = row.cells[column.key];
				if (cell.state === "active") row.cells[column.key] = { ...cell, state: "failed" };
			}
		}
		render();
	}

	async function finish(
		finishOptions: { isFailed?: boolean; finalLines?: readonly string[] } = {},
	): Promise<void> {
		await lifecycle.drainPump();
		if (finishOptions.isFailed === true) failActive();
		else settleOpen(state);
		tail.clear();
		render();
		sink.finish(finishOptions.finalLines ?? []);
		await lifecycle.stop();
	}

	async function stop(): Promise<void> {
		await lifecycle.stop();
	}

	return {
		begin,
		setRows,
		setGlobal,
		setGlobalSubstep,
		setCell,
		setAllCells,
		setAllOtherCells,
		applyPrLinks,
		note,
		failActive,
		finish,
		stop,
	};
}

export function applyPrLinksToRows(rows: MatrixRowView[], prLinks: readonly SubmitPrLink[]): void {
	const existingNumbers = new Set(
		rows.flatMap((row) => {
			const number = row.pr === undefined ? undefined : prNumberFromLink(row.pr);
			return number === undefined ? [] : [number];
		}),
	);
	const newRows = rows.filter((row) => row.kind === "new");
	const remainingLinks = prLinks.filter((link) => {
		const number = prNumberFromLink(link);
		return number === undefined || !existingNumbers.has(number);
	});
	if (remainingLinks.length !== newRows.length) return;
	for (const [index, row] of newRows.entries()) {
		const link = remainingLinks[index];
		if (link === undefined) continue;
		row.pr = link;
		row.label = formatRowLabel(row.branch, link);
	}
}

export function renderSubmitMatrixProgressFrame(input: {
	caps: Caps;
	title: string;
	globals: readonly MatrixGlobalView[];
	rows: readonly MatrixRowView[];
	tailLine?: string;
	tick?: number;
}): readonly string[] {
	const tick = input.tick ?? 0;
	const lines = [bold(input.title)];
	for (const global of input.globals) {
		lines.push(renderGlobalLine(input.caps, global, tick));
		for (const substep of global.substeps) {
			lines.push(renderGlobalSubstepLine(input.caps, substep, tick));
		}
	}
	lines.push("");
	lines.push(renderHeader(input.caps));
	for (const row of input.rows) {
		lines.push(renderMatrixRow(input.caps, row, tick));
	}
	if (input.tailLine !== undefined) {
		lines.push(
			`       ${dim(truncatePlain(input.tailLine, Math.max(0, input.caps.columns - 7), ellipsisFor(input.caps)))}`,
		);
	}
	return lines;
}

function createSubmitMatrixState(rows: readonly SubmitMatrixRowSpec[]): {
	globals: MatrixGlobalView[];
	rows: MatrixRowView[];
} {
	return {
		globals: SUBMIT_MATRIX_GLOBAL_ROWS.map((row) => ({
			key: row.key,
			label: row.label,
			detail: row.detail,
			activeLabel: row.activeLabel,
			state: "pending",
			substeps: (row.substeps ?? []).map((substep) => ({ ...substep, state: "pending" })),
		})),
		rows: createSubmitMatrixRowViews(rows),
	};
}

function createSubmitMatrixRowViews(rows: readonly SubmitMatrixRowSpec[]): MatrixRowView[] {
	return rows.map((row) => ({
		branch: row.branch,
		label: row.label,
		kind: row.kind,
		...(row.pr === undefined ? {} : { pr: row.pr }),
		cells: {
			metadata: { state: "pending" },
			submit: { state: "pending" },
			verify: { state: "pending" },
			description: { state: "pending" },
		},
	}));
}

function createSubmitMatrixRenderer(options: {
	caps: Caps;
	sink: StreamSink;
	title: string;
	globals: () => readonly MatrixGlobalView[];
	rows: () => readonly MatrixRowView[];
	tailLine: () => string | undefined;
}): { render(): void } {
	const frame: FrameRenderer = (tick) => {
		const tailLine = options.tailLine();
		return renderSubmitMatrixProgressFrame({
			caps: options.caps,
			title: options.title,
			globals: options.globals(),
			rows: options.rows(),
			...(tailLine === undefined ? {} : { tailLine }),
			tick,
		});
	};
	return {
		render: () => options.sink.render(frame),
	};
}

function renderGlobalLine(caps: Caps, row: MatrixGlobalView, tick: number): string {
	return statusLine({
		caps,
		item: { name: row.label, detail: row.text ?? row.detail, label: row.text ?? row.activeLabel },
		state: row.state,
		tick,
	});
}

function renderGlobalSubstepLine(caps: Caps, row: MatrixGlobalSubstepView, tick: number): string {
	const rendered = statusLine({
		caps: { ...caps, columns: Math.max(0, caps.columns - 4) },
		item: { name: row.label, detail: row.text ?? row.detail, label: row.text ?? row.activeLabel },
		state: row.state,
		tick,
	});
	return `    ${rendered}`;
}

function renderHeader(caps: Caps): string {
	return dim(
		`${padPlain("Branch / PR", labelWidth(caps))}  ${SUBMIT_MATRIX_COLUMNS.map((column) => padPlain(column.label, columnWidth(column.key))).join("  ")}`,
	);
}

function renderMatrixRow(caps: Caps, row: MatrixRowView, tick: number): string {
	const label = padPlain(
		truncatePlain(row.label, labelWidth(caps), ellipsisFor(caps)),
		labelWidth(caps),
	);
	const cells = SUBMIT_MATRIX_COLUMNS.map((column) =>
		padPlain(renderCell(caps, row.cells[column.key], tick), columnWidth(column.key)),
	).join("  ");
	return `${label}  ${cells}`;
}

function renderCell(caps: Caps, cell: MatrixCellView, tick: number): string {
	switch (cell.state) {
		case "pending":
			return dim("·");
		case "active":
			return paint(caps, "accent", spinnerFrame(caps, tick));
		case "done":
			return "✓";
		case "skipped":
			return dim("–");
		case "failed":
			return "✗";
	}
}

function labelWidth(caps: Caps): number {
	return Math.max(18, Math.min(36, caps.columns - 44));
}

function columnWidth(column: SubmitMatrixColumnKey): number {
	switch (column) {
		case "metadata":
			return 8;
		case "submit":
			return 6;
		case "verify":
			return 6;
		case "description":
			return 11;
	}
}

function phaseInfos(specs: readonly PhaseSpec[]) {
	return specs.map((spec) => ({
		key: spec.key,
		name: spec.item.name,
		...(spec.item.label === undefined ? {} : { label: spec.item.label }),
		...(spec.item.detail === undefined ? {} : { detail: spec.item.detail }),
	}));
}

function settleOpen(state: { globals: MatrixGlobalView[]; rows: MatrixRowView[] }): void {
	for (const global of state.globals) {
		if (global.state === "active") global.state = "done";
		for (const substep of global.substeps) {
			if (substep.state === "active") substep.state = "done";
		}
	}
	for (const row of state.rows) {
		for (const column of SUBMIT_MATRIX_COLUMNS) {
			const cell = row.cells[column.key];
			if (cell.state === "active") row.cells[column.key] = { ...cell, state: "done" };
		}
	}
}

function formatRowLabel(branch: string, pr: SubmitPrLink | undefined): string {
	if (pr === undefined) return branch;
	return `${branch} (${pr.label})`;
}

function prNumberFromLink(link: SubmitPrLink): string | undefined {
	return prNumberFromUrl(link.url) ?? link.label.match(/^#(\d+)$/)?.[1];
}

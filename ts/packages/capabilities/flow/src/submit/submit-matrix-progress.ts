import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { ActiveOperation, NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	defineMatrixWorkflow,
	matrixFrameOptionalFields,
	type MatrixWorkflowController,
} from "../phase-stream/matrix-progress-core.ts";
import type {
	MatrixCellState,
	MatrixCellUpdate,
	MatrixColumnSpec,
	MatrixRowView,
} from "../phase-stream/matrix-progress-state.ts";
import type { MatrixFrameOptionalFields } from "../phase-stream/matrix-progress-terminal-adapter.ts";
import type { FlowLiveOutput } from "../phase-stream/live-output.ts";
import { submitPhaseSpecs } from "../phase-stream/phase-stream-specs.ts";
import { prNumberFromUrl, type SubmitPrLink } from "./gt-output.ts";

export type SubmitMatrixCellState = MatrixCellState;
export type SubmitMatrixColumnKey = "metadata" | "description";
export type SubmitMatrixCellUpdate = MatrixCellUpdate;
export type SubmitMetadataProgressReason =
	| "existing-pr"
	| "amendment-not-applicable"
	| "generating-metadata"
	| "metadata-drafted"
	| "amending-metadata-commit"
	| "metadata-prepared"
	| "metadata-amendment-failed"
	| "metadata-generation-failed";

export type SubmitMatrixColumnSpec = MatrixColumnSpec<SubmitMatrixColumnKey>;

export interface SubmitMatrixRowSpec {
	branch: string;
	label: string;
	kind: "existing" | "new";
	pr?: SubmitPrLink;
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
	setActiveOperations(operations: readonly ActiveOperation[]): void;
	phase(event: NsProgressPhaseEvent): void;
	setCell(branch: string, column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void;
	setCellByPrNumber(
		prNumber: number,
		column: SubmitMatrixColumnKey,
		update: SubmitMatrixCellUpdate,
	): void;
	setAllCells(column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void;
	setPendingCells(column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void;
	applyPrLinks(prLinks: readonly SubmitPrLink[]): void;
}

export interface SubmitMatrixProgressController extends SubmitMatrixProgressSink {
	begin(): void;
	note(text: string): void;
	finish(options?: { isFailed?: boolean; finalLines?: readonly string[] }): Promise<void>;
	stop(): Promise<void>;
}

export interface SubmitMatrixRowView {
	branch: string;
	label: string;
	kind: "existing" | "new";
	pr?: SubmitPrLink;
	cells: MatrixRowView<SubmitMatrixColumnKey>["cells"];
}

export const SUBMIT_MATRIX_COLUMNS: readonly SubmitMatrixColumnSpec[] = [
	{ key: "metadata", label: "Metadata", width: 8 },
	{ key: "description", label: "Description", width: 11 },
];

/** Map a branch-level metadata reason to a compact label that fits the 8-column Metadata cell. */
export function compactSubmitMetadataCellText(reason: SubmitMetadataProgressReason): string {
	switch (reason) {
		case "existing-pr":
			return "exists";
		case "amendment-not-applicable":
			return "n/a";
		case "generating-metadata":
			return "gen";
		case "metadata-drafted":
			return "drafted";
		case "amending-metadata-commit":
			return "amend";
		case "metadata-prepared":
			return "ready";
		case "metadata-amendment-failed":
		case "metadata-generation-failed":
			return "failed";
	}
}

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

function submitMatrixWorkflow(hasHooks: boolean) {
	return defineMatrixWorkflow({
		columns: SUBMIT_MATRIX_COLUMNS,
		phases: submitPhaseSpecs(hasHooks),
		labelHeader: "Branch / PR",
		rowKey: (row: SubmitMatrixRowSpec) => row.branch,
	});
}

type SubmitWorkflowController = MatrixWorkflowController<
	SubmitMatrixRowSpec,
	SubmitMatrixColumnKey
>;

export function createSubmitMatrixProgressController(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	title: string;
	rows: readonly SubmitMatrixRowSpec[];
	hasHooks: boolean;
	progress?: NsProgress;
}): SubmitMatrixProgressController {
	const controller = submitMatrixWorkflow(options.hasHooks).createController({
		title: options.title,
		rows: options.rows,
		presentation:
			options.progress === undefined
				? { kind: "terminal", caps: options.caps, deps: options.deps }
				: {
						kind: "terminal-and-event",
						caps: options.caps,
						deps: options.deps,
						progress: options.progress,
					},
		begin: "lazy",
	});
	return adaptSubmitMatrixProgressController(controller);
}

export interface SubmitProgressResolution {
	matrix: SubmitMatrixProgressController;
	onOutput?: FlowLiveOutput;
}

export function resolveSubmitProgress(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	liveProgress?: NsProgress;
	liveOutput?: FlowLiveOutput;
	hasHooks: boolean;
}): SubmitProgressResolution | undefined {
	if (options.caps.isTty) {
		const matrix = createSubmitMatrixProgressController({
			caps: options.caps,
			deps: options.deps,
			title: "ns flow submit",
			rows: [],
			hasHooks: options.hasHooks,
			...(options.liveProgress === undefined ? {} : { progress: options.liveProgress }),
		});
		return { matrix, onOutput: (_stream, text) => matrix.note(text) };
	}
	if (options.liveProgress === undefined) return undefined;
	return {
		matrix: createSubmitMatrixEventProgressController({
			progress: options.liveProgress,
			title: "ns flow submit",
			rows: [],
			hasHooks: options.hasHooks,
		}),
		...(options.liveOutput === undefined ? {} : { onOutput: options.liveOutput }),
	};
}

export function createSubmitMatrixEventProgressController(options: {
	progress: NsProgress;
	title: string;
	rows: readonly SubmitMatrixRowSpec[];
	hasHooks: boolean;
}): SubmitMatrixProgressController {
	return adaptSubmitMatrixProgressController(
		submitMatrixWorkflow(options.hasHooks).createController({
			title: options.title,
			rows: options.rows,
			presentation: { kind: "event", progress: options.progress },
			begin: "lazy",
		}),
	);
}

function adaptSubmitMatrixProgressController(
	controller: SubmitWorkflowController,
): SubmitMatrixProgressController {
	function applyPrLinks(prLinks: readonly SubmitPrLink[]): void {
		const deltas = applyPrLinksToRows(controller.getRows(), prLinks);
		for (const delta of deltas) {
			controller.dispatch({
				kind: "row-patched",
				rowKey: delta.branch,
				patch: { pr: delta.pr, label: delta.label },
			});
		}
	}

	function setCellByPrNumber(
		prNumber: number,
		column: SubmitMatrixColumnKey,
		update: SubmitMatrixCellUpdate,
	): void {
		const row = controller
			.getRows()
			.find((candidate) => prNumberForRow(candidate) === String(prNumber));
		if (row === undefined) return;
		controller.dispatch({ kind: "cell-changed", rowKey: row.branch, column, update });
	}

	function setPendingCells(column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void {
		controller.dispatch({ kind: "cells-in-state-changed", column, fromState: "pending", update });
	}

	return {
		begin: controller.begin,
		setRows: (rows) => controller.dispatch({ kind: "rows-replaced", rows }),
		setActiveOperations: (operations) =>
			controller.dispatch({ kind: "active-operations-changed", operations }),
		phase: (event) => controller.dispatch({ kind: "phase-event", event }),
		setCell: (rowKey, column, update) =>
			controller.dispatch({ kind: "cell-changed", rowKey, column, update }),
		setCellByPrNumber,
		setAllCells: (column, update) =>
			controller.dispatch({ kind: "all-cells-changed", column, update }),
		setPendingCells,
		applyPrLinks,
		note: (text) => controller.dispatch({ kind: "note", text }),
		finish: controller.finish,
		stop: controller.stop,
	};
}

export interface SubmitMatrixRowLabelDelta {
	branch: string;
	pr: SubmitPrLink;
	label: string;
}

export function applyPrLinksToRows(
	rows: readonly SubmitMatrixRowSpec[],
	prLinks: readonly SubmitPrLink[],
): readonly SubmitMatrixRowLabelDelta[] {
	const existingNumbers = new Set(
		rows.flatMap((row) => {
			const number = prNumberForRow(row);
			return number === undefined ? [] : [number];
		}),
	);
	const newRows = rows.filter((row) => row.kind === "new");
	const remainingLinks = prLinks.filter((link) => {
		const number = prNumberFromLink(link);
		return number === undefined || !existingNumbers.has(number);
	});
	if (remainingLinks.length !== newRows.length) return [];
	return newRows.flatMap((row, index) => {
		const link = remainingLinks[index];
		if (link === undefined) return [];
		return [{ branch: row.branch, pr: link, label: formatRowLabel(row.branch, link) }];
	});
}

export function renderSubmitMatrixProgressFrame(
	input: {
		caps: Caps;
		title: string;
		rows: readonly SubmitMatrixRowView[];
	} & MatrixFrameOptionalFields,
): readonly string[] {
	return submitMatrixWorkflow(false).renderFrame({
		caps: input.caps,
		title: input.title,
		rows: input.rows,
		...matrixFrameOptionalFields(input),
	});
}

function prNumberForRow(row: Pick<SubmitMatrixRowSpec, "pr">): string | undefined {
	return row.pr === undefined ? undefined : prNumberFromLink(row.pr);
}

function formatRowLabel(branch: string, pr: SubmitPrLink | undefined): string {
	if (pr === undefined) return branch;
	return `${branch} (${pr.label})`;
}

function prNumberFromLink(link: SubmitPrLink): string | undefined {
	return prNumberFromUrl(link.url) ?? link.label.match(/^#(\d+)$/)?.[1];
}

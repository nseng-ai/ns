import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { ActiveOperation, NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk/sdk";

import {
	defineMatrixWorkflow,
	matrixFrameOptionalFields,
	updateForPhase,
	type MatrixCellState,
	type MatrixCellUpdate,
	type MatrixColumnSpec,
	type MatrixFrameOptionalFields,
	type MatrixGlobalRowSpec,
	type MatrixGlobalView,
	type MatrixRowView,
} from "../phase-stream/matrix-progress-core.ts";
import { CHECKPOINT_PHASES, SUBMIT_PHASES } from "../phase-stream/phase-stream-specs.ts";
import { prNumberFromUrl, type SubmitPrLink } from "./gt-output.ts";

export type SubmitMatrixCellState = MatrixCellState;
export type SubmitMatrixColumnKey = "metadata" | "description";
export type SubmitMatrixGlobalKey =
	| "inventory"
	| "hooks"
	| "checkpoint"
	| "preflight"
	| "restack"
	| "submit"
	| "verify";
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

export type SubmitMatrixGlobalRowSpec = MatrixGlobalRowSpec<SubmitMatrixGlobalKey>;

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
	setGlobal(key: SubmitMatrixGlobalKey, update: SubmitMatrixCellUpdate): void;
	setGlobalSubstep(
		globalKey: SubmitMatrixGlobalKey,
		substepKey: string,
		update: SubmitMatrixCellUpdate,
	): void;
	setCell(branch: string, column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void;
	setCellByPrNumber(
		prNumber: number,
		column: SubmitMatrixColumnKey,
		update: SubmitMatrixCellUpdate,
	): void;
	setAllCells(column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void;
	setPendingCells(column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void;
	applyGlobalPhaseEvent(key: SubmitMatrixGlobalKey, event: NsProgressPhaseEvent): void;
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

export const SUBMIT_MATRIX_GLOBAL_ROWS: readonly SubmitMatrixGlobalRowSpec[] = [
	{
		key: "inventory",
		label: "Inventory",
		detail: "stack inventoried",
		activeLabel: "reading submit stack topology…",
	},
	{
		key: "hooks",
		label: "Hooks",
		detail: "hooks complete",
		activeLabel: "running pre-submit hooks…",
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
	{
		key: "submit",
		label: "Submit",
		detail: "stack submitted",
		activeLabel: "running gt submit…",
	},
	{
		key: "verify",
		label: "Verify",
		detail: "current PR verified",
		activeLabel: "checking current PR…",
	},
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

const submitMatrixWorkflow = defineMatrixWorkflow({
	columns: SUBMIT_MATRIX_COLUMNS,
	globalRows: SUBMIT_MATRIX_GLOBAL_ROWS,
	phases: SUBMIT_PHASES,
	rowKey: (row: SubmitMatrixRowSpec) => row.branch,
});

export function createSubmitMatrixProgressController(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	title: string;
	rows: readonly SubmitMatrixRowSpec[];
	forward?: NsProgress;
}): SubmitMatrixProgressController {
	const controller = submitMatrixWorkflow.createController({
		caps: options.caps,
		deps: options.deps,
		title: options.title,
		rows: options.rows,
		...(options.forward === undefined ? {} : { forward: options.forward }),
		begin: "lazy",
	});

	function applyGlobalPhaseEvent(key: SubmitMatrixGlobalKey, event: NsProgressPhaseEvent): void {
		if (!("phaseKey" in event)) return;
		if (event.phaseKey === key) {
			if (event.type === "phase-started")
				controller.setGlobal(key, updateForPhase("active", event.label));
			if (event.type === "phase-done")
				controller.setGlobal(key, updateForPhase("done", event.detail));
			if (event.type === "phase-failed")
				controller.setGlobal(key, updateForPhase("failed", event.detail));
			return;
		}
		if (event.type === "phase-started") {
			controller.setGlobalSubstep(key, event.phaseKey, updateForPhase("active", event.label));
		}
		if (event.type === "phase-progress") {
			controller.setGlobalSubstep(key, event.phaseKey, updateForPhase("active", event.label));
		}
		if (event.type === "phase-done") {
			controller.setGlobalSubstep(key, event.phaseKey, updateForPhase("done", event.detail));
		}
		if (event.type === "phase-failed") {
			controller.setGlobalSubstep(key, event.phaseKey, updateForPhase("failed", event.detail));
		}
	}

	function applyPrLinks(prLinks: readonly SubmitPrLink[]): void {
		const deltas = applyPrLinksToRows(controller.getRows(), prLinks);
		for (const delta of deltas) {
			controller.patchRow(delta.branch, { pr: delta.pr, label: delta.label });
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
		controller.setCell(row.branch, column, update);
	}

	function setPendingCells(column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void {
		controller.setCellsInState(column, "pending", update);
	}

	return {
		begin: controller.begin,
		setRows: controller.setRows,
		setActiveOperations: controller.setActiveOperations,
		setGlobal: controller.setGlobal,
		setGlobalSubstep: controller.setGlobalSubstep,
		setCell: controller.setCell,
		setCellByPrNumber,
		setAllCells: controller.setAllCells,
		setPendingCells,
		applyGlobalPhaseEvent,
		applyPrLinks,
		note: controller.note,
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
		globals: readonly MatrixGlobalView<SubmitMatrixGlobalKey>[];
		rows: readonly SubmitMatrixRowView[];
	} & MatrixFrameOptionalFields,
): readonly string[] {
	return submitMatrixWorkflow.renderFrame({
		caps: input.caps,
		title: input.title,
		globals: input.globals,
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

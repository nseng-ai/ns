import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { ActiveOperation, NsProgress, NsProgressPhaseEvent } from "@nseng-ai/kernel/sdk";

import {
	commandOperations,
	createMatrixProgressController,
	renderMatrixProgressFrame,
	rowsWithKey,
	updateForPhase,
	type MatrixCellState,
	type MatrixCellUpdate,
	type MatrixColumnSpec,
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

export function createSubmitMatrixProgressController(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	title: string;
	rows: readonly SubmitMatrixRowSpec[];
	forward?: NsProgress;
}): SubmitMatrixProgressController {
	const controller = createMatrixProgressController({
		caps: options.caps,
		deps: options.deps,
		title: options.title,
		rows: rowsWithKey(options.rows, (row) => row.branch),
		columns: SUBMIT_MATRIX_COLUMNS,
		globalRows: SUBMIT_MATRIX_GLOBAL_ROWS,
		phases: SUBMIT_PHASES,
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
			controller.setActiveOperations(commandOperations(checkpointCommandsForPhase(event.phaseKey)));
			controller.setGlobalSubstep(key, event.phaseKey, updateForPhase("active", event.label));
		}
		if (event.type === "phase-progress") {
			controller.setGlobalSubstep(key, event.phaseKey, updateForPhase("active", event.label));
		}
		if (event.type === "phase-done") {
			controller.setActiveOperations([]);
			controller.setGlobalSubstep(key, event.phaseKey, updateForPhase("done", event.detail));
		}
		if (event.type === "phase-failed") {
			controller.setActiveOperations([]);
			controller.setGlobalSubstep(key, event.phaseKey, updateForPhase("failed", event.detail));
		}
	}

	function applyPrLinks(prLinks: readonly SubmitPrLink[]): void {
		controller.updateRows((rows) => {
			const submitRows = rows.filter(isSubmitMatrixRowView);
			if (submitRows.length !== rows.length) return;
			applyPrLinksToRows(submitRows, prLinks);
		});
	}

	function setCellByPrNumber(
		prNumber: number,
		column: SubmitMatrixColumnKey,
		update: SubmitMatrixCellUpdate,
	): void {
		controller.updateRows((rows) => {
			const row = rows
				.filter(isSubmitMatrixRowView)
				.find((item) => prNumberForRow(item) === String(prNumber));
			if (row === undefined) return;
			row.cells[column] = update;
		});
	}

	function setPendingCells(column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void {
		controller.updateRows((rows) => {
			for (const row of rows) {
				if (row.cells[column].state !== "pending") continue;
				row.cells[column] = update;
			}
		});
	}

	return {
		begin: controller.begin,
		setRows: (rows) => controller.setRows(rowsWithKey(rows, (row) => row.branch)),
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

export function applyPrLinksToRows(
	rows: SubmitMatrixRowView[],
	prLinks: readonly SubmitPrLink[],
): void {
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
	activeOperations?: readonly ActiveOperation[];
	globals: readonly MatrixGlobalView<SubmitMatrixGlobalKey>[];
	rows: readonly SubmitMatrixRowView[];
	tailLine?: string;
	tick?: number;
}): readonly string[] {
	return renderMatrixProgressFrame({
		caps: input.caps,
		title: input.title,
		columns: SUBMIT_MATRIX_COLUMNS,
		...(input.activeOperations === undefined ? {} : { activeOperations: input.activeOperations }),
		globals: input.globals,
		rows: rowsWithKey(input.rows, (row) => row.branch),
		...(input.tailLine === undefined ? {} : { tailLine: input.tailLine }),
		...(input.tick === undefined ? {} : { tick: input.tick }),
	});
}

function isSubmitMatrixRowView(
	row: MatrixRowView<SubmitMatrixColumnKey>,
): row is MatrixRowView<SubmitMatrixColumnKey> & SubmitMatrixRowView {
	return "branch" in row && typeof row.branch === "string" && "kind" in row;
}

function prNumberForRow(row: SubmitMatrixRowView): string | undefined {
	return row.pr === undefined ? undefined : prNumberFromLink(row.pr);
}

function checkpointCommandsForPhase(phaseKey: string): readonly string[] {
	switch (phaseKey) {
		case "inspect":
			return ["git status --porcelain", "git diff --stat", "git diff"];
		case "generate":
			return [];
		case "commit":
			return ["git add", "git commit"];
		default:
			return [];
	}
}

function formatRowLabel(branch: string, pr: SubmitPrLink | undefined): string {
	if (pr === undefined) return branch;
	return `${branch} (${pr.label})`;
}

function prNumberFromLink(link: SubmitPrLink): string | undefined {
	return prNumberFromUrl(link.url) ?? link.label.match(/^#(\d+)$/)?.[1];
}

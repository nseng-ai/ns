import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { ActiveOperation, NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	bindMatrixWorkflowActions,
	defineMatrixWorkflow,
	matrixFrameOptionalFields,
	type MatrixProgressPresentation,
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
import {
	SUBMIT_PHASES,
	SUBMIT_PHASES_WITH_CHECKS,
	type PhaseSpec,
} from "../phase-stream/phase-stream-specs.ts";
import { prNumberFromUrl, type SubmitPrLink } from "./gt-output.ts";
import type { ReconciledSubmitPr } from "./submit-pr-reconciliation.ts";

export type SubmitMatrixCellState = MatrixCellState;
export type SubmitMatrixColumnKey = "description";
export type SubmitMatrixCellUpdate = MatrixCellUpdate;

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
	applyBranchPrs(prs: readonly ReconciledSubmitPr[]): void;
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
	{ key: "description", label: "Description", width: 11 },
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

function createSubmitMatrixWorkflow(phases: readonly PhaseSpec[]) {
	return defineMatrixWorkflow<SubmitMatrixRowSpec, SubmitMatrixColumnKey>({
		columns: SUBMIT_MATRIX_COLUMNS,
		phases,
		labelHeader: "Branch / PR",
		rowKey: (row) => row.branch,
	});
}

const SUBMIT_MATRIX_WORKFLOW = createSubmitMatrixWorkflow(SUBMIT_PHASES);

const SUBMIT_MATRIX_WORKFLOW_WITH_CHECKS = createSubmitMatrixWorkflow(SUBMIT_PHASES_WITH_CHECKS);

type SubmitWorkflowController = MatrixWorkflowController<
	SubmitMatrixRowSpec,
	SubmitMatrixColumnKey
>;

export interface SubmitProgressResolution {
	matrix: SubmitMatrixProgressController;
	onOutput?: FlowLiveOutput;
}

export function resolveSubmitProgress(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	liveProgress?: NsProgress;
	liveOutput?: FlowLiveOutput;
	hasChecks: boolean;
}): SubmitProgressResolution {
	let presentation: MatrixProgressPresentation;
	if (options.caps.isTty) {
		presentation =
			options.liveProgress === undefined
				? { kind: "terminal", caps: options.caps, deps: options.deps }
				: {
						kind: "terminal-and-event",
						caps: options.caps,
						deps: options.deps,
						progress: options.liveProgress,
					};
	} else if (options.liveProgress !== undefined) {
		presentation = { kind: "event", progress: options.liveProgress };
	} else {
		presentation = { kind: "settled-transcript", caps: options.caps, deps: options.deps };
	}

	const matrix = createSubmitProgressController({
		presentation,
		hasChecks: options.hasChecks,
	});
	return {
		matrix,
		...(options.caps.isTty
			? { onOutput: (_stream: "stdout" | "stderr", text: string) => matrix.note(text) }
			: options.liveOutput === undefined
				? {}
				: { onOutput: options.liveOutput }),
	};
}

function createSubmitProgressController(options: {
	presentation: MatrixProgressPresentation;
	hasChecks: boolean;
}): SubmitMatrixProgressController {
	const workflow = options.hasChecks ? SUBMIT_MATRIX_WORKFLOW_WITH_CHECKS : SUBMIT_MATRIX_WORKFLOW;
	return adaptSubmitMatrixProgressController(
		workflow.createController({
			title: "ns flow submit",
			rows: [],
			presentation: options.presentation,
			begin: "lazy",
		}),
	);
}

function adaptSubmitMatrixProgressController(
	controller: SubmitWorkflowController,
): SubmitMatrixProgressController {
	const actions = bindMatrixWorkflowActions(controller);

	function applyBranchPrs(prs: readonly ReconciledSubmitPr[]): void {
		for (const pr of prs) {
			actions.patchRow(pr.branch, {
				pr: { label: pr.label, url: pr.url },
				label: formatRowLabel(pr.branch, pr),
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
		actions.setCell(row.branch, column, update);
	}

	function setPendingCells(column: SubmitMatrixColumnKey, update: SubmitMatrixCellUpdate): void {
		actions.setCellsInState(column, "pending", update);
	}

	return {
		begin: controller.begin,
		setRows: actions.setRows,
		setActiveOperations: actions.setActiveOperations,
		phase: actions.phase,
		setCell: actions.setCell,
		setCellByPrNumber,
		setAllCells: actions.setAllCells,
		setPendingCells,
		applyBranchPrs,
		note: actions.note,
		finish: controller.finish,
		stop: controller.stop,
	};
}

export function renderSubmitMatrixProgressFrame(
	input: {
		caps: Caps;
		title: string;
		rows: readonly SubmitMatrixRowView[];
	} & MatrixFrameOptionalFields,
): readonly string[] {
	return SUBMIT_MATRIX_WORKFLOW.renderFrame({
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

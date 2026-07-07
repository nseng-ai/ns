import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { NsProgress } from "@nseng-ai/kernel/sdk";

import {
	createMatrixProgressController,
	renderMatrixProgressFrame,
	rowsWithKey,
	type MatrixCellUpdate,
	type MatrixColumnSpec,
	type MatrixRowView,
} from "../phase-stream/matrix-progress-core.ts";
import { LAND_PHASES } from "../phase-stream/phase-stream-specs.ts";
import type { LandingPlan } from "./types.ts";

export type LandMatrixColumnKey = "gate" | "merge" | "verify" | "restack";

export interface LandMatrixRowSpec {
	branch: string;
	prNumber: number;
	label: string;
}

export interface LandMatrixProgressSink {
	setRows(rows: readonly LandMatrixRowSpec[]): void;
	setRunningCommands(commands: readonly string[]): void;
	setCell(branch: string, column: LandMatrixColumnKey, update: MatrixCellUpdate): void;
	setAllCells(column: LandMatrixColumnKey, update: MatrixCellUpdate): void;
	setAllOtherCells(column: LandMatrixColumnKey, branch: string, update: MatrixCellUpdate): void;
	recordMergedPr(prNumber: number): void;
}

export interface LandMatrixProgressController extends LandMatrixProgressSink {
	begin(): void;
	setTitle(title: string): void;
	note(text: string): void;
	finish(options?: { isFailed?: boolean; finalLines?: readonly string[] }): Promise<void>;
	stop(): Promise<void>;
}

export interface LandLiveProgressState {
	totalPrs?: number;
	landedPrs: number;
}

export const BASE_LAND_TITLE = "ns flow land";

export const LAND_MATRIX_COLUMNS: readonly MatrixColumnSpec<LandMatrixColumnKey>[] = [
	{ key: "gate", label: "Gate", width: 5 },
	{ key: "merge", label: "Merge", width: 6 },
	{ key: "verify", label: "Verify", width: 6 },
	{ key: "restack", label: "Restack", width: 7 },
];

export function formatLandProgressTitle(state: LandLiveProgressState): string {
	if (state.totalPrs !== undefined) {
		return `${BASE_LAND_TITLE} — ${state.landedPrs}/${state.totalPrs} target PRs merged`;
	}
	if (state.landedPrs > 0) {
		return `${BASE_LAND_TITLE} — ${state.landedPrs} target PR${state.landedPrs === 1 ? "" : "s"} merged`;
	}
	return BASE_LAND_TITLE;
}

export function landMatrixRowsFromPlan(
	plan: Pick<LandingPlan, "branchPlans" | "stack">,
): readonly LandMatrixRowSpec[] {
	return plan.stack.landingBranches.map((branch) => {
		const branchPlan = plan.branchPlans.find((item) => item.branch === branch);
		const prNumber = branchPlan?.pr.number ?? 0;
		return {
			branch,
			prNumber,
			label: prNumber === 0 ? branch : `${branch} (#${prNumber})`,
		};
	});
}

export function createLandMatrixProgressController(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	forward?: NsProgress;
}): LandMatrixProgressController {
	const liveState: LandLiveProgressState = { landedPrs: 0 };
	const landedPrNumbers = new Set<number>();
	const controller = createMatrixProgressController({
		caps: options.caps,
		deps: options.deps,
		title: formatLandProgressTitle(liveState),
		rows: [],
		columns: LAND_MATRIX_COLUMNS,
		globalRows: [],
		phases: LAND_PHASES,
		...(options.forward === undefined ? {} : { forward: options.forward }),
		begin: "lazy",
	});

	function setRows(rows: readonly LandMatrixRowSpec[]): void {
		liveState.totalPrs = rows.length;
		controller.setTitle(formatLandProgressTitle(liveState));
		controller.setRows(rowsWithKey(rows, (row) => row.branch));
	}

	function recordMergedPr(prNumber: number): void {
		if (landedPrNumbers.has(prNumber)) return;
		landedPrNumbers.add(prNumber);
		liveState.landedPrs += 1;
		controller.setTitle(formatLandProgressTitle(liveState));
	}

	return {
		begin: controller.begin,
		setTitle: controller.setTitle,
		setRows,
		setRunningCommands: controller.setRunningCommands,
		setCell: controller.setCell,
		setAllCells: controller.setAllCells,
		setAllOtherCells: controller.setAllOtherCells,
		recordMergedPr,
		note: controller.note,
		finish: controller.finish,
		stop: controller.stop,
	};
}

export function renderLandMatrixProgressFrame(input: {
	caps: Caps;
	title: string;
	runningCommands?: readonly string[];
	rows: readonly (LandMatrixRowSpec & MatrixRowView<LandMatrixColumnKey>)[];
	tailLine?: string;
	tick?: number;
}): readonly string[] {
	return renderMatrixProgressFrame({
		caps: input.caps,
		title: input.title,
		columns: LAND_MATRIX_COLUMNS,
		...(input.runningCommands === undefined ? {} : { runningCommands: input.runningCommands }),
		globals: [],
		rows: input.rows,
		...(input.tailLine === undefined ? {} : { tailLine: input.tailLine }),
		...(input.tick === undefined ? {} : { tick: input.tick }),
	});
}

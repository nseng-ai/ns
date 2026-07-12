import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { NsProgress } from "@nseng-ai/sdk";

import { defineMatrixWorkflow } from "../phase-stream/matrix-progress-core.ts";
import type { MatrixCellUpdate, MatrixColumnSpec } from "../phase-stream/matrix-progress-state.ts";
import type { PhaseSpec } from "../phase-stream/phase-stream-specs.ts";
import {
	stackSquashNonSquashOutcome,
	stackSquashOutcomePresentation,
	type ProcessedStackBranch,
	type StackSquashPlanEntry,
} from "./stack-squash.ts";

type StackSquashMatrixColumnKey = "commits" | "squash";

interface StackSquashMatrixRowSpec {
	branch: string;
	label: string;
	commitsBefore: number;
}

export interface StackSquashMatrixProgressController {
	note(text: string): void;
	setPlan(plan: readonly StackSquashPlanEntry[]): void;
	setSquashStatus(branch: string, update: MatrixCellUpdate): void;
	restoreStarted(): void;
	restoreCompleted(): void;
	finish(options?: { isFailed?: boolean }): Promise<void>;
	stop(): Promise<void>;
}

const STACK_SQUASH_MATRIX_COLUMNS: readonly MatrixColumnSpec<StackSquashMatrixColumnKey>[] = [
	{ key: "commits", label: "Commits", width: 7 },
	{ key: "squash", label: "Squash", width: 7 },
];

export const STACK_SQUASH_PHASES: readonly PhaseSpec[] = [
	{
		key: "inventory",
		item: { name: "Plan", detail: "stack inventoried", label: "counting commits per branch…" },
	},
	{
		key: "restore",
		item: { name: "Restore", detail: "tip restored", label: "restoring original tip…" },
	},
];

const stackSquashMatrixWorkflow = defineMatrixWorkflow<
	StackSquashMatrixRowSpec,
	StackSquashMatrixColumnKey
>({
	columns: STACK_SQUASH_MATRIX_COLUMNS,
	phases: STACK_SQUASH_PHASES,
	rowKey: (row) => row.branch,
});

export function createStackSquashMatrixProgressController(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	forward?: NsProgress;
}): StackSquashMatrixProgressController {
	const controller = stackSquashMatrixWorkflow.createController({
		title: "ns flow squash-stack",
		rows: [],
		presentation:
			options.forward === undefined
				? { kind: "terminal", caps: options.caps, deps: options.deps }
				: {
						kind: "terminal-and-event",
						caps: options.caps,
						deps: options.deps,
						progress: options.forward,
					},
		begin: "lazy",
	});

	function setPlan(plan: readonly StackSquashPlanEntry[]): void {
		controller.dispatch({
			kind: "rows-replaced",
			rows: plan.map((entry) => ({
				branch: entry.branch,
				label: entry.branch,
				commitsBefore: entry.commitsBefore,
			})),
		});
		for (const entry of plan) {
			controller.dispatch({
				kind: "cell-changed",
				rowKey: entry.branch,
				column: "commits",
				update: { state: "done", text: String(entry.commitsBefore) },
			});
			const nonSquashOutcome = stackSquashNonSquashOutcome(entry);
			if (nonSquashOutcome !== undefined) {
				controller.dispatch({
					kind: "cell-changed",
					rowKey: entry.branch,
					column: "squash",
					update: stackSquashOutcomePresentation(nonSquashOutcome).matrixUpdate,
				});
			}
		}
		controller.dispatch({
			kind: "phase-event",
			event: {
				type: "phase-done",
				phaseKey: "inventory",
				detail: `${plan.length} ${plan.length === 1 ? "branch" : "branches"} planned`,
			},
		});
	}

	return {
		note: (text) => controller.dispatch({ kind: "note", text }),
		setPlan,
		setSquashStatus: (rowKey, update) =>
			controller.dispatch({ kind: "cell-changed", rowKey, column: "squash", update }),
		restoreStarted: () =>
			controller.dispatch({
				kind: "phase-event",
				event: { type: "phase-started", phaseKey: "restore", label: "checking out tip" },
			}),
		restoreCompleted: () =>
			controller.dispatch({
				kind: "phase-event",
				event: { type: "phase-done", phaseKey: "restore", detail: "tip restored" },
			}),
		finish: controller.finish,
		stop: controller.stop,
	};
}

export function stackSquashCompletionUpdate(entry: ProcessedStackBranch): MatrixCellUpdate {
	return stackSquashOutcomePresentation(entry).matrixUpdate;
}

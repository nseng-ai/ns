import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { NsProgress } from "@nseng-ai/sdk";

import {
	bindMatrixWorkflowActions,
	defineMatrixWorkflow,
} from "../phase-stream/matrix-progress-core.ts";
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
	const actions = bindMatrixWorkflowActions(controller);

	function setPlan(plan: readonly StackSquashPlanEntry[]): void {
		actions.setRows(
			plan.map((entry) => ({
				branch: entry.branch,
				label: entry.branch,
				commitsBefore: entry.commitsBefore,
			})),
		);
		for (const entry of plan) {
			actions.setCell(entry.branch, "commits", {
				state: "done",
				text: String(entry.commitsBefore),
			});
			const nonSquashOutcome = stackSquashNonSquashOutcome(entry);
			if (nonSquashOutcome !== undefined) {
				actions.setCell(
					entry.branch,
					"squash",
					stackSquashOutcomePresentation(nonSquashOutcome).matrixUpdate,
				);
			}
		}
		actions.phase({
			type: "phase-done",
			phaseKey: "inventory",
			detail: `${plan.length} ${plan.length === 1 ? "branch" : "branches"} planned`,
		});
	}

	return {
		note: actions.note,
		setPlan,
		setSquashStatus: (rowKey, update) => actions.setCell(rowKey, "squash", update),
		restoreStarted: () =>
			actions.phase({ type: "phase-started", phaseKey: "restore", label: "checking out tip" }),
		restoreCompleted: () =>
			actions.phase({ type: "phase-done", phaseKey: "restore", detail: "tip restored" }),
		finish: controller.finish,
		stop: controller.stop,
	};
}

export function stackSquashCompletionUpdate(entry: ProcessedStackBranch): MatrixCellUpdate {
	return stackSquashOutcomePresentation(entry).matrixUpdate;
}

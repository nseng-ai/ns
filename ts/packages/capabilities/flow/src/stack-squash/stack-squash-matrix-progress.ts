import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { NsProgress } from "@nseng-ai/sdk";

import {
	defineMatrixWorkflow,
	type MatrixCellUpdate,
	type MatrixColumnSpec,
} from "../phase-stream/matrix-progress-core.ts";
import {
	stackSquashNonSquashOutcome,
	stackSquashOutcomePresentation,
	type ProcessedStackBranch,
	type StackSquashPlanEntry,
} from "./stack-squash.ts";

type StackSquashMatrixColumnKey = "commits" | "squash";
type StackSquashMatrixGlobalKey = "inventory" | "restore";

interface StackSquashMatrixRowSpec {
	branch: string;
	label: string;
	commitsBefore: number;
}

export interface StackSquashMatrixProgressController {
	note(text: string): void;
	setPlan(plan: readonly StackSquashPlanEntry[]): void;
	setSquashStatus(branch: string, update: MatrixCellUpdate): void;
	setRestore(update: MatrixCellUpdate): void;
	finish(options?: { isFailed?: boolean }): Promise<void>;
	stop(): Promise<void>;
}

const STACK_SQUASH_MATRIX_COLUMNS: readonly MatrixColumnSpec<StackSquashMatrixColumnKey>[] = [
	{ key: "commits", label: "Commits", width: 7 },
	{ key: "squash", label: "Squash", width: 7 },
];

const stackSquashMatrixWorkflow = defineMatrixWorkflow<
	StackSquashMatrixRowSpec,
	StackSquashMatrixColumnKey,
	StackSquashMatrixGlobalKey
>({
	columns: STACK_SQUASH_MATRIX_COLUMNS,
	globalRows: [
		{
			key: "inventory",
			label: "Plan",
			detail: "stack inventoried",
			activeLabel: "counting commits per branch…",
		},
		{
			key: "restore",
			label: "Restore",
			detail: "tip restored",
			activeLabel: "restoring original tip…",
		},
	],
	phases: [],
	rowKey: (row) => row.branch,
});

export function createStackSquashMatrixProgressController(options: {
	caps: Caps;
	deps: StreamSinkDeps;
	forward?: NsProgress;
}): StackSquashMatrixProgressController {
	const controller = stackSquashMatrixWorkflow.createController({
		caps: options.caps,
		deps: options.deps,
		title: "ns flow squash-stack",
		rows: [],
		...(options.forward === undefined ? {} : { forward: options.forward }),
		begin: "lazy",
	});

	function setPlan(plan: readonly StackSquashPlanEntry[]): void {
		controller.setRows(
			plan.map((entry) => ({
				branch: entry.branch,
				label: entry.branch,
				commitsBefore: entry.commitsBefore,
			})),
		);
		for (const entry of plan) {
			controller.setCell(entry.branch, "commits", {
				state: "done",
				text: String(entry.commitsBefore),
			});
			const nonSquashOutcome = stackSquashNonSquashOutcome(entry);
			if (nonSquashOutcome !== undefined) {
				controller.setCell(
					entry.branch,
					"squash",
					stackSquashOutcomePresentation(nonSquashOutcome).matrixUpdate,
				);
			}
		}
		controller.setGlobal("inventory", {
			state: "done",
			text: `${plan.length} ${plan.length === 1 ? "branch" : "branches"} planned`,
		});
	}

	return {
		note: controller.note,
		setPlan,
		setSquashStatus: (branch, update) => controller.setCell(branch, "squash", update),
		setRestore: (update) => controller.setGlobal("restore", update),
		finish: controller.finish,
		stop: controller.stop,
	};
}

export function stackSquashCompletionUpdate(entry: ProcessedStackBranch): MatrixCellUpdate {
	return stackSquashOutcomePresentation(entry).matrixUpdate;
}

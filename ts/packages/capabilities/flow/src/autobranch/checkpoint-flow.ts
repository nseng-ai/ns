import {
	runDirtyAutobranchFlow,
	type FileStat,
	type ParsedAutobranchArgs,
} from "./dirty-worktree.ts";
import type { AutobranchFlowResult } from "./flow-result.ts";
import { createLatestCommitAutobranchFlow } from "./latest-commit.ts";
import type { CommandResult } from "@ns/capability-kit/checkpoint-flow";
import {
	loadPendingWorktreeSnapshot,
	type PendingWorktreeSnapshot,
} from "@ns/capability-kit/pending-worktree";

import { formatPendingWorktreeError } from "./pending-worktree-format.ts";

export type FlowAutobranchRequest = ParsedAutobranchArgs;
export type FlowAutobranchCheckpointResult = AutobranchFlowResult;
export type FlowAutobranchFileStat = FileStat;

export interface FlowAutobranchCheckpointInput {
	cwd: string;
	args: FlowAutobranchRequest;
	exec: (command: string, args: string[], timeout: number) => Promise<CommandResult>;
	prepareCheckpointMessage: (
		snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	commitPreparedCheckpointMessage: (
		message: string,
	) => Promise<{ summary: string } | { error: string }>;
	onPhase?: (message: string) => void;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FlowAutobranchFileStat>;
	now?: () => number;
}

export async function createFlowAutobranchCheckpointFlow(
	input: FlowAutobranchCheckpointInput,
): Promise<FlowAutobranchCheckpointResult> {
	input.onPhase?.("Inspecting worktree…");
	const loaded = await loadPendingWorktreeSnapshot({
		cwd: input.cwd,
		execGit: (args, timeout) => input.exec("git", args, timeout),
	});
	if (!loaded.ok) {
		return {
			ok: false,
			outcome: "failure",
			error: formatPendingWorktreeError(loaded.error),
		};
	}

	const snapshot = loaded.snapshot;
	if (snapshot.clean) {
		return createLatestCommitAutobranchFlow({
			cwd: input.cwd,
			args: input.args,
			snapshot,
			exec: input.exec,
			...(input.onPhase ? { onPhase: input.onPhase } : {}),
			...(input.now ? { now: input.now } : {}),
		});
	}

	return runDirtyAutobranchFlow({
		cwd: input.cwd,
		args: input.args,
		snapshot,
		exec: input.exec,
		prepareCheckpointMessage: input.prepareCheckpointMessage,
		commitPreparedCheckpointMessage: input.commitPreparedCheckpointMessage,
		...(input.onPhase ? { onPhase: input.onPhase } : {}),
		...(input.readFile ? { readFile: input.readFile } : {}),
		...(input.stat ? { stat: input.stat } : {}),
		...(input.now ? { now: input.now } : {}),
	});
}

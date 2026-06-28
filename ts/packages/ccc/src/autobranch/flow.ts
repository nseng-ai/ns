import {
	runDirtyAutobranchFlow,
	type AutobranchFlowResult,
	type FileStat,
	type ParsedAutobranchArgs,
} from "@sdl/autobranch/dirty-worktree";
import { createLatestCommitAutobranchFlow } from "@sdl/autobranch/latest-commit";
import type { CommandResult } from "@sdl/capability-kit/checkpoint-flow";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "@sdl/capability-kit/pending-worktree";

export type { AutobranchFlowResult, FileStat, ParsedAutobranchArgs };

export interface AutobranchFlowInput {
	cwd: string;
	args: ParsedAutobranchArgs;
	exec: (command: string, args: string[], timeout: number) => Promise<CommandResult>;
	prepareCheckpointMessage: (
		snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	commitPreparedCheckpointMessage: (
		message: string,
	) => Promise<{ summary: string } | { error: string }>;
	onPhase?: (message: string) => void;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FileStat>;
	now?: (() => number) | undefined;
}

export async function createAutobranchCheckpointFlow(
	input: AutobranchFlowInput,
): Promise<AutobranchFlowResult> {
	input.onPhase?.("Inspecting worktree…");
	const loaded = await loadPendingWorktreeSnapshot({
		cwd: input.cwd,
		execGit: (args, timeout) => input.exec("git", args, timeout),
	});
	if (!loaded.ok) {
		// A failed worktree probe is a real failure, not a declined guardrail.
		return { ok: false, outcome: "failure", error: formatAutobranchSnapshotError(loaded.error) };
	}

	const snapshot = loaded.snapshot;
	if (snapshot.clean) {
		return createLatestCommitAutobranchFlow({
			cwd: input.cwd,
			args: input.args,
			snapshot,
			exec: input.exec,
			...(input.onPhase ? { onPhase: input.onPhase } : {}),
			now: input.now,
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

function formatAutobranchSnapshotError(error: PendingWorktreeError): string {
	const details = formatPendingWorktreeCommandDetails(error.result);
	if (error.kind === "not_git_repo") {
		return `Not inside a git repository.\n${details}`;
	}
	if (error.kind === "detached_head") {
		return `Detached HEAD; check out a branch before autobranching.\n${details}`;
	}
	if (error.kind === "status_failed") {
		return `Could not read git status.\n${details}`;
	}
	return `Could not read git diff.\n${details}`;
}

import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
	type PreparedCheckpointMessage,
} from "@sdl/capability-kit/checkpoint-flow";
import { createTextGenerator } from "@sdl/kernel/context";
import type { PendingWorktreeSnapshot } from "@sdl/capability-kit/pending-worktree";
import { selectCheckpointModelRef } from "@sdl/capability-kit/text-generation";

export type { CommandResult, PreparedCheckpointMessage };

export async function prepareAutobranchCheckpointMessage(
	snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	env: Record<string, string | undefined>,
): Promise<PreparedCheckpointMessage> {
	return prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		modelRef: selectCheckpointModelRef(env),
		textGenerator: createTextGenerator(),
	});
}

export async function commitAutobranchCheckpointMessage(
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>,
	cwd: string,
	message: string,
): Promise<{ summary: string } | { error: string }> {
	return createCommitWithPreparedMessage({
		cwd,
		message,
		exec,
	});
}

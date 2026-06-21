import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
	type PreparedCheckpointMessage,
} from "@sdl/sdl/checkpoint-flow";
import { createTextGenerator } from "@sdl/sdl/context";
import type { PendingWorktreeSnapshot } from "@sdl/sdl/pending-worktree";
import { selectCheckpointModelRef } from "@sdl/sdl/text-generation";

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

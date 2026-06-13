import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
	type PreparedCheckpointMessage,
} from "@asdl/sdl/checkpoint-flow";
import { createTextGenerationGateway } from "@asdl/sdl/context";
import type { PendingWorktreeSnapshot } from "@asdl/sdl/pending-worktree";
import { selectCheckpointModelRef } from "@asdl/sdl/text-generation";

export type { CommandResult, PreparedCheckpointMessage };

export async function prepareCheckpointMessageWithAsdlDev(
	snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	env: Record<string, string | undefined>,
): Promise<PreparedCheckpointMessage> {
	return prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		modelRef: selectCheckpointModelRef(env),
		textGeneration: createTextGenerationGateway(),
	});
}

export async function commitPreparedCheckpointMessageWithAsdlDev(
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

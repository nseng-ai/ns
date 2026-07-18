import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
	type PreparedCheckpointMessage,
} from "@nseng-ai/capability-kit/checkpoint-flow";
import type { PendingWorktreeSnapshot } from "@nseng-ai/capability-kit/pending-worktree";
import type {
	TextGenerationReasoning,
	TextGenerator,
} from "@nseng-ai/capability-kit/text-generation";

export type { CommandResult, PreparedCheckpointMessage };

export async function prepareAutobranchCheckpointMessage(
	snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	modelRef: string,
	reasoning: TextGenerationReasoning,
	textGenerator: TextGenerator,
): Promise<PreparedCheckpointMessage> {
	return prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		modelRef,
		reasoning,
		textGenerator,
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

import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
	type PreparedCheckpointMessage,
} from "@nseng-ai/extension-kit/checkpoint-flow";
import type { PendingWorktreeSnapshot } from "@nseng-ai/extension-kit/pending-worktree";
import type { TextGenerator } from "@nseng-ai/extension-kit/text-generation";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

export type { CommandResult, PreparedCheckpointMessage };

export async function prepareAutobranchCheckpointMessage(
	snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	modelSelection: ModelSelection,
	textGenerator: TextGenerator,
): Promise<PreparedCheckpointMessage> {
	return prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		modelSelection,
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

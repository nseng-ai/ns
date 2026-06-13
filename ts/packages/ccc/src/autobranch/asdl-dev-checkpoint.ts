import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
	type PreparedCheckpointMessage,
} from "@asdl/sdl/checkpoint-flow";
import { createTextGenerationGateway } from "@asdl/sdl/context";
import type { PendingWorktreeSnapshot } from "@asdl/sdl/pending-worktree";
import { selectCheckpointTextGenerationConfig } from "@asdl/sdl/text-generation";

export type { CommandResult, PreparedCheckpointMessage };

export async function prepareCheckpointMessageWithAsdlDev(
	snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	env: Record<string, string | undefined>,
): Promise<PreparedCheckpointMessage> {
	const textConfig = selectCheckpointTextGenerationConfig(env);
	if (!textConfig.ok) {
		return { ok: false, error: textConfig.error };
	}

	return prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		modelRef: textConfig.value.modelRef,
		textGeneration: createTextGenerationGateway(textConfig.value.backend),
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

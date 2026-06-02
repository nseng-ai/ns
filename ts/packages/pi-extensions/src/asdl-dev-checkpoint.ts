import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
	type PreparedCheckpointMessage,
} from "../../asdl-dev/src/checkpoint-flow.ts";
import { createTextGenerationGateway } from "../../asdl-dev/src/context.ts";
import type { PendingWorktreeSnapshot } from "../../asdl-dev/src/pending-worktree.ts";
import { selectCheckpointTextGenerationConfig } from "../../asdl-dev/src/text-generation.ts";

export type { CommandResult, PreparedCheckpointMessage };

export type ExtensionExec = {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<CommandResult>;
};

export async function prepareCheckpointMessageWithAsdlDev(
	snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	env: Record<string, string | undefined> = process.env,
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
	pi: ExtensionExec,
	cwd: string,
	message: string,
): Promise<{ summary: string } | { error: string }> {
	return createCommitWithPreparedMessage({
		cwd,
		message,
		exec: (command, args, commandCwd, timeout) => pi.exec(command, args, { cwd: commandCwd, timeout }),
	});
}

import { createCommitWithPreparedMessage, prepareCheckpointMessage } from "../checkpoint-flow.ts";
import { formatCheckpointSnapshotError } from "../checkpoint.ts";
import { loadPendingWorktreeSnapshot } from "../pending-worktree.ts";
import { defineCommand, failed, ok } from "../sdk.ts";
import { selectCheckpointModelRef } from "../text-generation.ts";

export const defaultCpCommand = defineCommand({
	name: "cp",
	description: "Create a checkpoint commit for the current diff.",
	async run(ctx) {
		const loaded = await loadPendingWorktreeSnapshot({
			cwd: ctx.cwd,
			execGit: (args, timeout) => ctx.exec("git", args, { timeoutMs: timeout }),
		});
		if (!loaded.ok) {
			return failed(formatCheckpointSnapshotError(loaded.error), 2);
		}

		const snapshot = loaded.snapshot;
		if (snapshot.branch === "main" || snapshot.branch === "master") {
			return failed(`Refusing to create checkpoint commit on trunk branch: ${snapshot.branch}`, 1);
		}
		if (snapshot.clean) {
			return failed("Working tree is clean; nothing to checkpoint.", 1);
		}

		const prepared = await prepareCheckpointMessage({
			status: snapshot.status,
			diff: snapshot.diff,
			textGeneration: ctx.model,
			modelRef: selectCheckpointModelRef(ctx.env),
		});
		if (!prepared.ok) {
			return failed(prepared.error, 2);
		}

		const committed = await createCommitWithPreparedMessage({
			cwd: ctx.cwd,
			message: prepared.message,
			exec: (command, args, _cwd, timeout) => ctx.exec(command, args, { timeoutMs: timeout }),
		});
		if ("error" in committed) {
			return failed(committed.error, 2);
		}

		return ok(`${committed.summary}\n${prepared.message}`);
	},
});

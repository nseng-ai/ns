import {
	commitPreparedCheckpointMessage,
	prepareCheckpointMessageForPi,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "./checkpoint-pi.ts";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
} from "./pending-worktree.ts";

const COMMAND_NAME = "cp";

export default function checkpointExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a checkpoint commit for the current diff",
		handler: async (_args, ctx) => {
			await createCheckpointCommit(pi, ctx);
		},
	});
}

export async function createCheckpointCommit(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<boolean> {
	await ctx.waitForIdle();

	const loaded = await loadPendingWorktreeSnapshot({
		cwd: ctx.cwd,
		execGit: (args, timeout) => pi.exec("git", args, { cwd: ctx.cwd, timeout }),
	});
	if (!loaded.ok) {
		ctx.ui.notify(formatCheckpointSnapshotError(loaded.error), "error");
		return false;
	}

	const snapshot = loaded.snapshot;
	if (snapshot.branch === "main" || snapshot.branch === "master") {
		ctx.ui.notify(`Refusing to create checkpoint commit on trunk branch: ${snapshot.branch}`, "error");
		return false;
	}
	if (snapshot.clean) {
		ctx.ui.notify("Working tree is clean; nothing to checkpoint.", "error");
		return false;
	}

	const prepared = await prepareCheckpointMessageForPi(pi, ctx, snapshot);
	if (!prepared.ok) {
		ctx.ui.notify(prepared.error, "error");
		return false;
	}

	const committed = await commitPreparedCheckpointMessage(pi, ctx.cwd, prepared.message);
	if ("error" in committed) {
		ctx.ui.notify(committed.error, "error");
		return false;
	}

	ctx.ui.notify(`${committed.summary}\n${prepared.message}`, "info");
	return true;
}

function formatCheckpointSnapshotError(error: PendingWorktreeError): string {
	const details = formatPendingWorktreeCommandDetails(error.result);
	if (error.kind === "not_git_repo") {
		return `Not inside a git repository.\n${details}`;
	}
	if (error.kind === "detached_head") {
		return `Could not determine current branch.\n${details}`;
	}
	if (error.kind === "status_failed") {
		return `Could not inspect git status.\n${details}`;
	}
	return `Could not capture git diff.\n${details}`;
}

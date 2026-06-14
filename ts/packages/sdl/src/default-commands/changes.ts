import { draftChangesSummary } from "../changes-model-summary.ts";
import { formatOutstandingChangesMessage } from "../changes-summary.ts";
import { formatPendingWorktreeCommandDetails, loadPendingWorktreeSnapshot, type PendingWorktreeError } from "../pending-worktree.ts";
import { defineCommand, failed, ok } from "../sdk.ts";

export const defaultChangesCommand = defineCommand({
	name: "changes",
	description: "Summarize outstanding worktree changes without committing.",
	async run(ctx) {
		const loaded = await loadPendingWorktreeSnapshot({
			cwd: ctx.cwd,
			execGit: (args, timeout) => ctx.exec("git", args, { timeoutMs: timeout }),
		});
		if (!loaded.ok) {
			return failed(formatChangesSnapshotError(loaded.error), 2);
		}

		const snapshot = loaded.snapshot;
		if (snapshot.clean) {
			return ok("Working tree is clean; no outstanding changes.");
		}

		const summary = await draftChangesSummary({ model: ctx.model, env: ctx.env, snapshot });
		if (!summary.ok) {
			return failed(summary.error, 2);
		}

		return ok(formatOutstandingChangesMessage({ snapshot, summaryText: summary.summaryText }));
	},
});

function formatChangesSnapshotError(error: PendingWorktreeError): string {
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

import { draftChangesSummary } from "../changes-model-summary.ts";
import { formatOutstandingChangesMessage } from "../changes-summary.ts";
import { formatCheckpointSnapshotError } from "../checkpoint.ts";
import { loadPendingWorktreeSnapshot } from "../pending-worktree.ts";
import { failed, ok, type SdlCommand } from "../sdk/index.ts";

export const defaultChangesCommand = {
	name: "changes",
	summary: "Summarize outstanding worktree changes without committing.",
	description: "Summarize outstanding worktree changes without committing.",
	async run(ctx) {
		const loaded = await loadPendingWorktreeSnapshot({
			cwd: ctx.cwd,
			execGit: (args, timeout) => ctx.exec("git", args, { timeoutMs: timeout }),
		});
		if (!loaded.ok) {
			return failed(formatCheckpointSnapshotError(loaded.error), 2);
		}

		const snapshot = loaded.snapshot;
		if (snapshot.clean) {
			return ok("Working tree is clean; no outstanding changes.");
		}

		const summary = await draftChangesSummary({
			textGenerator: ctx.textGenerator,
			env: ctx.env,
			snapshot,
		});
		if (!summary.ok) {
			return failed(summary.error, 2);
		}

		return ok(formatOutstandingChangesMessage({ snapshot, summaryText: summary.summaryText }));
	},
} satisfies SdlCommand;

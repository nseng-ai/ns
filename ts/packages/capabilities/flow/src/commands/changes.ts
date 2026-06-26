import { defineExtension, failed, ok, type SdlCommand } from "sdl-sdk";
import { prepareFlowChangesSummary } from "../shared/model-generation.ts";
import {
	CHANGES_MODEL_ENV,
	DEFAULT_CHANGES_MODEL_REF,
	LEGACY_CHANGES_MODEL_ENV,
} from "../shared/text-generation.ts";
import {
	formatPendingWorktreeError,
	loadFlowPendingWorktreeSnapshot,
	type PendingWorktreeSnapshot,
} from "../shared/worktree.ts";

// This project-local extension uses the public SDL SDK plus internal migration
// exports while duplicated workflow helpers move into package-owned modules.
const MAX_DISPLAY_FILE_LINES = 50;

const CHANGES_COMMAND_DESCRIPTION = `Summarize outstanding worktree changes without committing.

The command captures a pending worktree snapshot with read-only git commands. Clean worktrees print that there are no outstanding changes. Dirty worktrees ask the configured text-generation model for 1–4 reviewer-facing bullets, then print the bullets and raw porcelain status lines.

Environment:
  ${CHANGES_MODEL_ENV}  Model reference for generated changes summaries. Defaults to ${DEFAULT_CHANGES_MODEL_REF}. Falls back to ${LEGACY_CHANGES_MODEL_ENV} when unset.

The command owns human stdout/stderr, has no alternate output-format flag, and does not stage, commit, stash, switch branches, run Graphite, or call GitHub.`;

export const flowChangesCommand: SdlCommand = {
	name: "changes",
	summary: "Summarize outstanding worktree changes without committing.",
	description: CHANGES_COMMAND_DESCRIPTION,
	async run(ctx) {
		const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
		if (!loaded.ok) {
			return failed(formatPendingWorktreeError(loaded.error), 2);
		}

		const snapshot = loaded.snapshot;
		if (snapshot.clean) {
			return ok("Working tree is clean; no outstanding changes.");
		}

		const summary = await prepareFlowChangesSummary(ctx, snapshot);
		if (!summary.ok) {
			return failed(summary.error, 2);
		}

		return ok(formatOutstandingChangesMessage(snapshot, summary.summaryText));
	},
};

export default defineExtension({
	commands: [flowChangesCommand],
});

function formatOutstandingChangesMessage(
	snapshot: PendingWorktreeSnapshot,
	summaryText: string,
): string {
	const lines = [`Outstanding changes on ${snapshot.branch}`, ""];
	lines.push(
		...summaryText
			.trim()
			.split(/\r?\n/)
			.filter((line) => line.trim().length > 0),
	);
	lines.push("", "Files:");
	lines.push(...displayFileLines(statusFileLines(snapshot.status)));
	return lines.join("\n");
}

function statusFileLines(status: string): string[] {
	return status
		.replace(/\r/g, "")
		.split("\n")
		.filter((line) => line.length > 0);
}

function displayFileLines(fileLines: readonly string[]): string[] {
	if (fileLines.length === 0) {
		return ["(no status lines)"];
	}

	const displayed = fileLines.slice(0, MAX_DISPLAY_FILE_LINES);
	const omitted = fileLines.length - displayed.length;
	if (omitted > 0) {
		displayed.push(`... ${omitted} more file(s)`);
	}
	return displayed;
}

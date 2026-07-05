import { dim, glyph, renderBufferedReport } from "@nseng-ai/core/cli-theme";
import { commandIoFromNsExtensionApi, runWithNsCommandIo } from "@nseng-ai/kernel/command-io";
import { renderCapabilitiesForTerminal, type Caps } from "@nseng-ai/clinkr";
import { defineExtension, failed, ok, type NsCommand } from "@nseng-ai/kernel/sdk";
import { prepareFlowChangesSummary } from "../model-generation.ts";
import {
	CHANGES_MODEL_ENV,
	DEFAULT_CHANGES_MODEL_REF,
	LEGACY_CHANGES_MODEL_ENV,
} from "@nseng-ai/capability-kit/text-generation";
import {
	isGitPorcelainUnmergedStatus,
	parseGitPorcelainStatusOutput,
	type GitPorcelainStatus,
	type GitPorcelainStatusLine,
} from "../../changes/git-porcelain.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import { formatPendingWorktreeError } from "../../autobranch/pending-worktree-format.ts";
import { loadFlowPendingWorktreeSnapshot, type PendingWorktreeSnapshot } from "../worktree.ts";

// This project-local extension uses the public ns SDK plus internal migration
// exports while duplicated workflow helpers move into package-owned modules.
const MAX_DISPLAY_FILE_LINES = 50;

const GIT_STATUS_LABEL_CODES = ["R", "C", "A", "D", "M"] as const;
type GitStatusLabelCode = (typeof GIT_STATUS_LABEL_CODES)[number];

const GIT_STATUS_LABELS = {
	R: "renamed",
	C: "copied",
	A: "added",
	D: "deleted",
	M: "modified",
} satisfies Readonly<Record<GitStatusLabelCode, string>>;

const CHANGES_COMMAND_DESCRIPTION = `Summarize outstanding worktree changes without committing.

The command captures a pending worktree snapshot with read-only git commands. Clean worktrees print that there are no outstanding changes. Dirty worktrees ask the configured text-generation model for 1–4 reviewer-facing bullets, then print the bullets and raw porcelain status lines.

Environment:
  ${CHANGES_MODEL_ENV}  Model reference for generated changes summaries. Defaults to ${DEFAULT_CHANGES_MODEL_REF}. Falls back to ${LEGACY_CHANGES_MODEL_ENV} when unset.

The command owns human stdout/stderr, has no alternate output-format flag, and does not stage, commit, stash, switch branches, run Graphite, or call GitHub.`;

export const flowChangesCommand: NsCommand = {
	name: "changes",
	summary: "Summarize outstanding worktree changes without committing.",
	description: CHANGES_COMMAND_DESCRIPTION,
	async run(ctx) {
		const io = commandIoFromNsExtensionApi(ctx);
		return await runWithNsCommandIo(io, async (io) => {
			io.phase("Inspecting worktree…");
			const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
			if (!loaded.ok) {
				return failed(formatPendingWorktreeError(loaded.error), 2);
			}

			const snapshot = loaded.snapshot;
			if (snapshot.clean) {
				return ok("Working tree is clean; no outstanding changes.");
			}

			io.phase("Generating changes summary…");
			const summary = await prepareFlowChangesSummary(ctx, snapshot);
			if (!summary.ok) {
				return failed(summary.error, 2);
			}

			const caps = resolveFlowStreamCaps(ctx);
			return ok(formatOutstandingChangesMessage(caps, snapshot, summary.summaryText));
		});
	},
};

export default defineExtension({
	commands: [flowChangesCommand],
});

function formatOutstandingChangesMessage(
	terminalCaps: Caps,
	snapshot: PendingWorktreeSnapshot,
	summaryText: string,
): string {
	return renderBufferedReport({
		caps: renderCapabilitiesForTerminal(terminalCaps),
		title: `Outstanding changes on ${snapshot.branch}`,
		sections: [
			{ title: "Summary", lines: summaryLines(terminalCaps, summaryText) },
			{
				title: "Files",
				lines: displayFileLines(terminalCaps, parseGitPorcelainStatusOutput(snapshot.status)),
			},
		],
	});
}

function summaryLines(terminalCaps: Caps, summaryText: string): string[] {
	return summaryText
		.trim()
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => bulletLine(terminalCaps, line.replace(/^-\s+/, "")));
}

function displayFileLines(
	terminalCaps: Caps,
	fileLines: readonly GitPorcelainStatusLine[],
): string[] {
	if (fileLines.length === 0) {
		return ["(no status lines)"];
	}

	const displayed = fileLines
		.slice(0, MAX_DISPLAY_FILE_LINES)
		.map((line) => formatStatusFileLine(terminalCaps, line));
	const omitted = fileLines.length - displayed.length;
	if (omitted > 0) {
		displayed.push(dim(`… ${omitted} more file(s)`));
	}
	return displayed;
}

function formatStatusFileLine(terminalCaps: Caps, line: GitPorcelainStatusLine): string {
	return bulletLine(terminalCaps, `${statusLabel(line.status).padEnd(10)} ${line.path}`);
}

function bulletLine(terminalCaps: Caps, text: string): string {
	return `${glyph(terminalCaps, "bullet")} ${text}`;
}

function statusLabel(status: GitPorcelainStatus): string {
	if (isGitPorcelainUnmergedStatus(status)) return "unmerged";
	if (status.index === "?" && status.worktree === "?") return "untracked";

	const indexLabel = statusCodeLabel(status.index);
	if (indexLabel !== undefined) return indexLabel;

	const worktreeLabel = statusCodeLabel(status.worktree);
	if (worktreeLabel !== undefined) return worktreeLabel;

	const trimmedStatus = status.raw.trim();
	return trimmedStatus.length > 0 ? trimmedStatus : "changed";
}

function statusCodeLabel(code: string): string | undefined {
	if (!isGitStatusLabelCode(code)) return undefined;
	return GIT_STATUS_LABELS[code];
}

function isGitStatusLabelCode(code: string): code is GitStatusLabelCode {
	return GIT_STATUS_LABEL_CODES.some((knownCode) => knownCode === code);
}

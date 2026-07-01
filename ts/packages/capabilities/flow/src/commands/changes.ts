import { dim, glyph, renderBufferedReport } from "@sdl/cli-theme";
import { commandIoFromSdlExtensionApi, runWithSdlCommandIo } from "@sdl/kernel/command-io";
import { renderCapabilitiesForTerminal, type Caps } from "@sdl/clinkr";
import { defineExtension, failed, ok, type SdlCommand } from "sdl-sdk";
import { prepareFlowChangesSummary } from "../shared/model-generation.ts";
import {
	CHANGES_MODEL_ENV,
	DEFAULT_CHANGES_MODEL_REF,
	LEGACY_CHANGES_MODEL_ENV,
} from "../shared/text-generation.ts";
import { resolveFlowStreamCaps } from "../shared/phase-stream.ts";
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
		const io = commandIoFromSdlExtensionApi(ctx);
		return await runWithSdlCommandIo(io, async (io) => {
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
			{ title: "Files", lines: displayFileLines(terminalCaps, statusFileLines(snapshot.status)) },
		],
	});
}

function summaryLines(terminalCaps: Caps, summaryText: string): string[] {
	const bullet = glyph(terminalCaps, "bullet");
	return summaryText
		.trim()
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => `${bullet} ${line.replace(/^-\s+/, "")}`);
}

function statusFileLines(status: string): string[] {
	return status
		.replace(/\r/g, "")
		.split("\n")
		.filter((line) => line.length > 0);
}

function displayFileLines(terminalCaps: Caps, fileLines: readonly string[]): string[] {
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

function formatStatusFileLine(terminalCaps: Caps, line: string): string {
	const parsed = parseStatusFileLine(line);
	const bullet = glyph(terminalCaps, "bullet");
	if (parsed === undefined) return `${bullet} ${line}`;
	return `${bullet} ${statusLabel(parsed.status).padEnd(10)} ${parsed.path}`;
}

function parseStatusFileLine(line: string): { status: string; path: string } | undefined {
	if (line.length < 4) return undefined;
	const status = line.slice(0, 2);
	const path = line.slice(3).trim();
	if (path.length === 0) return undefined;
	return { status, path };
}

function statusLabel(status: string): string {
	if (status.includes("U")) return "unmerged";
	if (status.includes("?")) return "untracked";
	if (status.includes("R")) return "renamed";
	if (status.includes("C")) return "copied";
	if (status.includes("A")) return "added";
	if (status.includes("D")) return "deleted";
	if (status.includes("M")) return "modified";
	return status.trim() || "changed";
}

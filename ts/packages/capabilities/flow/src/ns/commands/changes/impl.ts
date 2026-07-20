import { MODEL_OPERATION_IDS } from "@nseng-ai/capability-kit/model-policy";
import {
	loadPendingWorktreeSnapshot,
	type PendingWorktreeSnapshot,
} from "@nseng-ai/capability-kit/pending-worktree";
import {
	renderCapabilitiesForTerminal,
	resolveRenderCapabilities,
	type Caps,
} from "@nseng-ai/clinkr";
import { dim, glyph, renderBufferedReport } from "@nseng-ai/foundation/cli-theme";
import { failure, ok } from "@nseng-ai/sdk";
import type { NsClinkrCommandBundle } from "@nseng-ai/sdk/command";

import { formatPendingWorktreeError } from "../../../autobranch/pending-worktree-format.ts";
import { draftChangesSummary } from "../../../changes/changes-model-summary.ts";
import {
	isGitPorcelainUnmergedStatus,
	parseGitPorcelainStatusOutput,
	type GitPorcelainStatus,
	type GitPorcelainStatusLine,
} from "../../../changes/git-porcelain.ts";
import { progressPhaseInfos, type PhaseSpec } from "../../../phase-stream/phase-stream-specs.ts";
import { FLOW_COMMAND_FAILED } from "../../flow-cli-runner.ts";
import type { FlowCommandContext } from "../../context.ts";
import { resolveFlowModelSelectionAt } from "../../model-policy.ts";

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

const CHANGES_PHASES: readonly PhaseSpec[] = [
	{
		key: "inspect",
		item: { name: "Inspect", detail: "worktree inspected", label: "inspecting worktree…" },
	},
	{
		key: "policy",
		item: {
			name: "Policy",
			detail: "changes model policy resolved",
			label: "resolving changes model policy…",
		},
	},
	{
		key: "generate",
		item: {
			name: "Generate",
			detail: "changes summary generated",
			label: "generating changes summary…",
		},
	},
];

export async function runChangesCommand(
	context: FlowCommandContext,
	bundle: NsClinkrCommandBundle,
) {
	bundle.events.emit({
		type: "phases-declared",
		title: "ns flow changes",
		phases: progressPhaseInfos(CHANGES_PHASES),
	});
	bundle.events.emit({ type: "phase-started", phaseKey: "inspect" });
	const loaded = await loadPendingWorktreeSnapshot({
		cwd: bundle.cwd,
		git: context.git,
		execGit: async (args, timeout) =>
			await context.commandRunner("git", args, { cwd: bundle.cwd, timeout }),
	});
	if (!loaded.ok) {
		return failure(FLOW_COMMAND_FAILED, formatPendingWorktreeError(loaded.error));
	}
	bundle.events.emit({ type: "phase-done", phaseKey: "inspect", detail: "worktree inspected" });

	const snapshot = loaded.snapshot;
	if (snapshot.clean) {
		bundle.events.emit({ type: "phase-done", phaseKey: "policy", detail: "not required" });
		bundle.events.emit({ type: "phase-done", phaseKey: "generate", detail: "not required" });
		return ok("Working tree is clean; no outstanding changes.");
	}

	bundle.events.emit({ type: "phase-started", phaseKey: "policy" });
	const model = await resolveFlowModelSelectionAt(
		{ cwd: bundle.cwd, git: context.git },
		MODEL_OPERATION_IDS.flowChanges,
	);
	if (!model.ok) return failure(FLOW_COMMAND_FAILED, model.error);
	bundle.events.emit({
		type: "phase-done",
		phaseKey: "policy",
		detail: "changes model policy resolved",
	});

	bundle.events.emit({ type: "phase-started", phaseKey: "generate" });
	const summary = await draftChangesSummary({
		textGenerator: context.textGenerator,
		modelSelection: model.modelSelection,
		snapshot,
	});
	if (!summary.ok) return failure(FLOW_COMMAND_FAILED, summary.error);
	bundle.events.emit({
		type: "phase-done",
		phaseKey: "generate",
		detail: "changes summary generated",
	});
	return ok(renderOutstandingChanges(bundle.caps, snapshot, summary.summaryText));
}

function renderOutstandingChanges(
	capabilities: Parameters<typeof resolveRenderCapabilities>[0],
	snapshot: PendingWorktreeSnapshot,
	summaryText: string,
): string {
	const terminalCaps = resolveRenderCapabilities(capabilities);
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
	if (fileLines.length === 0) return ["(no status lines)"];
	const displayed = fileLines
		.slice(0, MAX_DISPLAY_FILE_LINES)
		.map((line) => bulletLine(terminalCaps, `${statusLabel(line.status).padEnd(10)} ${line.path}`));
	const omittedFileCount = fileLines.length - displayed.length;
	if (omittedFileCount > 0) displayed.push(dim(`… ${omittedFileCount} more file(s)`));
	return displayed;
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

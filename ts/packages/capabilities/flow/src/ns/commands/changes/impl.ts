import type { FirstPartyCommandContext } from "@nseng-ai/capability-kit";
import { MODEL_OPERATION_IDS } from "@nseng-ai/capability-kit/model-policy";
import {
	loadPendingWorktreeSnapshot,
	type PendingWorktreeSnapshot,
} from "@nseng-ai/capability-kit/pending-worktree";
import {
	renderCapabilitiesForTerminal,
	resolveRenderCapabilities,
	type Caps,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import { dim, glyph, renderBufferedReport } from "@nseng-ai/foundation/cli-theme";
import { failure, ok } from "@nseng-ai/sdk";
import type { ClinkrHandlerBundle } from "@nseng-ai/sdk/command";

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
import { resolveFlowModelSelectionAt } from "../../model-policy.ts";

export const MAX_DISPLAY_FILE_LINES = 50;

export interface ChangesFile {
	path: string;
	status: string;
	indexStatus: string;
	worktreeStatus: string;
	label: string;
}

export type ChangesResult =
	| {
			state: "clean";
			branch: string;
			summary: string[];
			files: ChangesFile[];
			totalFileCount: 0;
			omittedFileCount: 0;
	  }
	| {
			state: "dirty";
			branch: string;
			summary: string[];
			files: ChangesFile[];
			totalFileCount: number;
			omittedFileCount: number;
	  };

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
	services: FirstPartyCommandContext,
	bundle: ClinkrHandlerBundle,
) {
	bundle.events.emit({
		type: "phases-declared",
		title: "ns flow changes",
		phases: progressPhaseInfos(CHANGES_PHASES),
	});
	bundle.events.emit({ type: "phase-started", phaseKey: "inspect" });
	const loaded = await loadPendingWorktreeSnapshot({
		cwd: bundle.cwd,
		git: services.git,
		execGit: async (args, timeout) =>
			await services.commandRunner("git", args, { cwd: bundle.cwd, timeout }),
	});
	if (!loaded.ok) {
		return failure(FLOW_COMMAND_FAILED, formatPendingWorktreeError(loaded.error));
	}
	bundle.events.emit({ type: "phase-done", phaseKey: "inspect", detail: "worktree inspected" });

	const snapshot = loaded.snapshot;
	if (snapshot.clean) {
		bundle.events.emit({ type: "phase-done", phaseKey: "policy", detail: "not required" });
		bundle.events.emit({ type: "phase-done", phaseKey: "generate", detail: "not required" });
		return ok(cleanResult(snapshot));
	}

	bundle.events.emit({ type: "phase-started", phaseKey: "policy" });
	const model = await resolveFlowModelSelectionAt(
		{ cwd: bundle.cwd, git: services.git },
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
		textGenerator: services.textGenerator,
		modelSelection: model.modelSelection,
		snapshot,
	});
	if (!summary.ok) return failure(FLOW_COMMAND_FAILED, summary.error);
	bundle.events.emit({
		type: "phase-done",
		phaseKey: "generate",
		detail: "changes summary generated",
	});
	return ok(dirtyResult(snapshot, summary.summaryText));
}

export function renderChangesHuman(
	result: ChangesResult,
	capabilities: RenderCapabilities,
): string {
	if (result.state === "clean") return "Working tree is clean; no outstanding changes.";
	const terminalCaps = resolveRenderCapabilities(capabilities);
	return renderBufferedReport({
		caps: renderCapabilitiesForTerminal(terminalCaps),
		title: `Outstanding changes on ${result.branch}`,
		sections: [
			{ title: "Summary", lines: result.summary.map((line) => bulletLine(terminalCaps, line)) },
			{ title: "Files", lines: displayFileLines(terminalCaps, result) },
		],
	});
}

function cleanResult(snapshot: PendingWorktreeSnapshot): ChangesResult {
	return {
		state: "clean",
		branch: snapshot.branch,
		summary: [],
		files: [],
		totalFileCount: 0,
		omittedFileCount: 0,
	};
}

function dirtyResult(snapshot: PendingWorktreeSnapshot, summaryText: string): ChangesResult {
	const parsedFiles = parseGitPorcelainStatusOutput(snapshot.status);
	const files = parsedFiles.slice(0, MAX_DISPLAY_FILE_LINES).map(toChangesFile);
	return {
		state: "dirty",
		branch: snapshot.branch,
		summary: summaryItems(summaryText),
		files,
		totalFileCount: parsedFiles.length,
		omittedFileCount: parsedFiles.length - files.length,
	};
}

function toChangesFile(line: GitPorcelainStatusLine): ChangesFile {
	return {
		path: line.path,
		status: line.status.raw,
		indexStatus: line.status.index,
		worktreeStatus: line.status.worktree,
		label: statusLabel(line.status),
	};
}

function summaryItems(summaryText: string): string[] {
	return summaryText
		.trim()
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => line.replace(/^-\s+/, ""));
}

function displayFileLines(
	terminalCaps: Caps,
	result: Extract<ChangesResult, { state: "dirty" }>,
): string[] {
	if (result.files.length === 0) return ["(no status lines)"];
	const displayed = result.files.map((file) =>
		bulletLine(terminalCaps, `${file.label.padEnd(10)} ${file.path}`),
	);
	if (result.omittedFileCount > 0) {
		displayed.push(dim(`… ${result.omittedFileCount} more file(s)`));
	}
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

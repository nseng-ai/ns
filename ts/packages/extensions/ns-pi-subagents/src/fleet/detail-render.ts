import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import { isRecord } from "@nseng-ai/foundation/primitives";

import type { RunnerSubagentUsageMetadata } from "../runner-subagents/extension-api.ts";
import { formatRunnerSubagentElapsed } from "../runner-subagents/presentation.ts";
import type { RunnerSubagentTimelineEntry } from "../runner-subagents/timeline.ts";
import { entrySessionFile, entryTitle } from "./detail.ts";
import type {
	FleetNavigatorEntry,
	SubagentFleetPostRunCommitSummary,
	SubagentFleetPostRunSummary,
	SubagentFleetTaskDetail,
} from "./detail.ts";
import type { WorktreeStateSnapshot } from "./worktree-state.ts";

type AvailableRunnerSubagentUsageMetadata = Extract<
	RunnerSubagentUsageMetadata,
	{ status: "available" }
>;

export function usageLine(detail: SubagentFleetTaskDetail): string {
	switch (detail.usage?.status) {
		case "available": {
			const totals = detail.usage.totals;
			const cached = totals.cacheRead + totals.cacheWrite;
			return `tokens: ${formatTokenCount(totals.input)} in · ${formatTokenCount(totals.output)} out · ${formatTokenCount(cached)} cached · $${totals.cost.total.toFixed(3)}`;
		}
		case "unavailable":
			return `tokens: unavailable (${detail.usage.reason})`;
		default:
			return "tokens: unavailable";
	}
}

export function usageTrendLines(detail: SubagentFleetTaskDetail): string[] {
	const usage = availableUsage(detail);
	if (usage === undefined) return [];
	const latest = usage.trend.latestTurn;
	const latestText = `latest +${formatTokenCount(latest.input)} in/+${formatTokenCount(latest.output)} out`;
	const contextText =
		usage.trend.contextWindow === undefined
			? `peak prompt ${formatTokenCount(usage.trend.peakPromptTokens)}`
			: `peak prompt ${formatTokenCount(usage.trend.peakPromptTokens)}/${formatTokenCount(usage.trend.contextWindow)} (${formatContextPercent(usage.trend.peakPromptTokens, usage.trend.contextWindow)})`;
	return [`trend: ${latestText} · ${contextText}`];
}

export function availableUsage(
	detail: SubagentFleetTaskDetail,
): AvailableRunnerSubagentUsageMetadata | undefined {
	return detail.usage?.status === "available" ? detail.usage : undefined;
}

export function formatContextPercent(promptTokens: number, contextWindow: number): string {
	return `${((promptTokens / contextWindow) * 100).toFixed(1)}%`;
}

export function formatTokenCount(count: number): string {
	if (count < 1000) return String(count);
	return `${(count / 1000).toFixed(1)}k`;
}

export const MAX_WORKTREE_STATE_FILES = 10;

export function renderPostRunSummaryLines(
	summary: SubagentFleetPostRunSummary | undefined,
): string[] {
	if (summary === undefined) return [];
	const lines = ["post-run summary:", `  status: ${summary.status}`];
	if (summary.retry !== undefined) {
		lines.push(
			truncatePlain(
				`  retry: ${summary.status === "final-text" ? "succeeded after" : "attempted after"} transient ${summary.retry.firstAttemptStatus} — ${summary.retry.firstAttemptDiagnostic}`,
				200,
			),
		);
	}
	if (summary.lastDiagnostic !== undefined) {
		lines.push(truncatePlain(`  last diagnostic: ${summary.lastDiagnostic}`, 200));
	}
	lines.push(`  commit: ${formatCommitSummary(summary.commit)}`);
	lines.push(...renderSharedWorktreeSummaryLines(summary.worktreeState));
	return lines;
}

export function formatCommitSummary(commit: SubagentFleetPostRunCommitSummary): string {
	switch (commit.status) {
		case "changed":
			return `HEAD changed ${shortOid(commit.from)} → ${shortOid(commit.to)}`;
		case "unchanged":
			return `none detected (HEAD unchanged ${shortOid(commit.head)})`;
		case "unavailable":
			return `unavailable (${commit.reason})`;
		default: {
			const exhaustive: never = commit;
			return exhaustive;
		}
	}
}

export function shortOid(oid: string): string {
	return oid.slice(0, 7);
}

export function renderSharedWorktreeSummaryLines(
	worktreeState: WorktreeStateSnapshot | undefined,
): string[] {
	return renderWorktreeStateSnapshotLines(worktreeState, {
		missingLines: ["  shared worktree: unavailable (not read)"],
		label: "shared worktree",
		indent: "  ",
		fileIndent: "    ",
	});
}

export function renderWorktreeStateLines(detail: SubagentFleetTaskDetail): string[] {
	return renderWorktreeStateSnapshotLines(detail.worktreeState, {
		missingLines: [],
		label: "worktree state",
		indent: "",
		fileIndent: "  ",
	});
}

export function renderWorktreeStateSnapshotLines(
	worktreeState: WorktreeStateSnapshot | undefined,
	options: {
		missingLines: readonly string[];
		label: string;
		indent: string;
		fileIndent: string;
	},
): string[] {
	if (worktreeState === undefined) return [...options.missingLines];
	if (worktreeState.status === "unavailable") {
		return [
			truncatePlain(
				`${options.indent}${options.label}: unavailable (${worktreeState.reason})`,
				200,
			),
		];
	}
	if (worktreeState.files.length === 0) return [`${options.indent}${options.label}: clean`];
	const visibleFiles = worktreeState.files.slice(0, MAX_WORKTREE_STATE_FILES);
	const lines = [`${options.indent}${options.label}: ${worktreeState.files.length} changed files`];
	for (const file of visibleFiles) {
		const status = file.status === undefined ? "" : `${file.status} `;
		const stat = formatWorktreeStateStat(file);
		const suffix = stat.length === 0 ? "" : ` ${stat}`;
		lines.push(truncatePlain(`${options.fileIndent}${status}${file.path}${suffix}`, 200));
	}
	const remaining = worktreeState.files.length - visibleFiles.length;
	if (remaining > 0) lines.push(`${options.fileIndent}… ${remaining} more`);
	return lines;
}

export function formatWorktreeStateStat(file: {
	additions?: number;
	deletions?: number;
	isBinary?: boolean;
}): string {
	if (file.isBinary === true) return "binary";
	if (file.additions === undefined && file.deletions === undefined) return "";
	return `+${file.additions ?? 0}/-${file.deletions ?? 0}`;
}

export function renderCurrentActionLines(detail: SubagentFleetTaskDetail): string[] {
	const liveActivity = detail.liveActivity;
	if (liveActivity === undefined || liveActivity.currentAction.kind === "idle") return [];
	const action = liveActivity.currentAction;
	const lines: string[] = [];
	if (action.kind === "thinking") {
		lines.push("current action: thinking / waiting for model output");
	} else {
		const summary = formatToolPreview(action.inputPreview);
		const suffix = summary === undefined ? "" : ` · ${summary}`;
		lines.push(truncatePlain(`current action: ▶ ${action.toolName}${suffix}`, 200));
		if (action.resultPreview !== undefined) {
			lines.push(
				truncatePlain(
					`  ↳ ${formatToolPreview(action.resultPreview) ?? action.resultPreview}`,
					200,
				),
			);
		}
	}
	if (liveActivity.quietMs !== undefined)
		lines.push(`heartbeat: quiet ${formatQuietSeconds(liveActivity.quietMs)}s`);
	return lines;
}

export function formatQuietSeconds(quietMs: number): number {
	return Math.max(0, Math.floor(quietMs / 1000));
}

export function renderTimelineEntry(entry: RunnerSubagentTimelineEntry): string {
	return renderTimelineEntryLines(entry)[0] ?? "";
}

export function renderTimelineEntryLines(entry: RunnerSubagentTimelineEntry): string[] {
	if (entry.kind === "assistant") return [`● assistant: ${entry.text}`];
	const icon = entry.state === "running" ? "▶" : entry.state === "error" ? "✗" : "✓";
	const input = formatToolPreview(entry.inputPreview);
	const suffix = input === undefined ? "" : ` · ${input}`;
	const lines = [truncatePlain(`${icon} ${entry.toolName}${suffix}`, 200)];
	const result = formatToolPreview(entry.resultPreview);
	if (result !== undefined) lines.push(truncatePlain(`  ↳ ${result}`, 200));
	return lines;
}

export function renderFleetDetailHeaderLines(input: {
	entry: FleetNavigatorEntry | undefined;
	detail: SubagentFleetTaskDetail | undefined;
}): string[] {
	const entry = input.entry;
	if (entry === undefined) return ["No selected subagent task."];
	const detail = input.detail;
	if (detail === undefined) {
		return [
			entryTitle(entry),
			"loading session…",
			"",
			`session: ${entrySessionFile(entry) ?? "—"}`,
		];
	}
	return [
		entryTitle(entry),
		`${detail.state} · ${detail.status} · ${detail.modelText} · ${detail.turnCount} turns / ${detail.toolCount} tools · ${formatRunnerSubagentElapsed(detail.elapsedMs)}`,
		usageLine(detail),
		...usageTrendLines(detail),
		`session: ${detail.sessionFile ?? "no session file yet"}`,
	];
}

export function renderFleetDetailContentLines(input: {
	detail: SubagentFleetTaskDetail;
	isPromptExpanded: boolean;
}): string[] {
	const detail = input.detail;
	const lines: string[] = [];
	const prompt = detail.prompt;
	if (prompt !== undefined) {
		if (input.isPromptExpanded) {
			lines.push("prompt:", ...prompt.split("\n"), "");
		} else {
			lines.push(truncatePlain(`prompt: ${promptPreview(prompt)} (p to expand)`, 200), "");
		}
	}
	if (detail.message !== undefined) {
		lines.push(detail.message);
		return lines;
	}
	const postRunSummaryLines = renderPostRunSummaryLines(detail.postRunSummary);
	if (postRunSummaryLines.length > 0) {
		lines.push(...postRunSummaryLines, "");
	} else {
		const currentActionLines = renderCurrentActionLines(detail);
		if (currentActionLines.length > 0) lines.push(...currentActionLines, "");
		const worktreeStateLines = renderWorktreeStateLines(detail);
		if (worktreeStateLines.length > 0) lines.push(...worktreeStateLines, "");
	}
	if (detail.timeline.droppedEntryCount > 0) {
		lines.push(`… ${detail.timeline.droppedEntryCount} earlier events dropped`);
	}
	for (const entry of detail.timeline.entries) {
		lines.push(...renderTimelineEntryLines(entry));
	}
	if (detail.timeline.entries.length === 0) {
		lines.push("No timeline events yet.");
	}
	return lines;
}

function promptPreview(prompt: string): string {
	const firstLine = prompt.split("\n", 1)[0] ?? "";
	return firstLine;
}

function formatToolPreview(preview: string | undefined): string | undefined {
	if (preview === undefined) return undefined;
	const parsed = parseJsonPreview(preview);
	if (parsed === undefined) return compactPlain(preview);
	return formatValuePreview(parsed, 0);
}

function parseJsonPreview(preview: string): unknown {
	const trimmed = preview.trim();
	if (!looksLikeJson(trimmed)) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
}

function looksLikeJson(value: string): boolean {
	return (
		value.startsWith("{") ||
		value.startsWith("[") ||
		value.startsWith('"') ||
		value === "null" ||
		value === "true" ||
		value === "false" ||
		/^-?\d/.test(value)
	);
}

const MAX_PREVIEW_RECORD_FIELDS = 6;
const MAX_PREVIEW_DEPTH = 2;

function formatValuePreview(value: unknown, depth: number): string {
	if (Array.isArray(value)) return formatArrayPreview(value, depth);
	if (isRecord(value)) return formatRecordPreview(value, depth);
	return formatScalarPreview(value);
}

function formatRecordPreview(value: Record<string, unknown>, depth: number): string {
	const entries = Object.entries(value);
	if (entries.length === 0) return "{}";
	if (depth >= MAX_PREVIEW_DEPTH) return "{…}";
	const visibleEntries = entries.slice(0, MAX_PREVIEW_RECORD_FIELDS).map(([key, fieldValue]) => {
		return `${key}: ${formatValuePreview(fieldValue, depth + 1)}`;
	});
	const remaining = entries.length - visibleEntries.length;
	if (remaining > 0) visibleEntries.push(`+${remaining} more`);
	const body = compactPlain(visibleEntries.join(" · "));
	return depth === 0 ? body : `{ ${body} }`;
}

function formatArrayPreview(value: readonly unknown[], depth: number): string {
	if (value.length === 0) return "[]";
	const scalarItems = value.filter((item) => !Array.isArray(item) && !isRecord(item));
	if (scalarItems.length === value.length && value.length <= 4) {
		return compactPlain(value.map((item) => formatValuePreview(item, depth + 1)).join(", "));
	}
	return `${value.length} items`;
}

function formatScalarPreview(value: unknown): string {
	if (typeof value === "string") return compactPlain(value);
	if (value === null) return "null";
	return compactPlain(String(value));
}

function compactPlain(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import { isRecord } from "@nseng-ai/foundation/primitives";

import { formatRunnerSubagentElapsed } from "../runner-subagents/presentation.ts";
import type {
	RunnerSubagentTimelineEntry,
	RunnerSubagentTimelineToolEntry,
} from "../runner-subagents/timeline.ts";
import { entrySessionFile, entryTitle } from "./detail.ts";
import type {
	FleetNavigatorEntry,
	SubagentFleetPostRunCommitSummary,
	SubagentFleetRunDuration,
	SubagentFleetTaskDetail,
} from "./detail.ts";
import { fleetToolPresentation } from "./tool-presentation.ts";

export function usageLine(detail: SubagentFleetTaskDetail): string {
	switch (detail.usage?.status) {
		case "available": {
			const totals = detail.usage.totals;
			const cached = totals.cacheRead + totals.cacheWrite;
			return `tokens: ${formatTokenCount(totals.input)} in · ${formatTokenCount(totals.output)} out · ${formatTokenCount(cached)} cached · $${totals.cost.total.toFixed(3)} · peak ${formatTokenCount(detail.usage.trend.peakPromptTokens)}`;
		}
		case "unavailable":
			return `tokens: unavailable (${detail.usage.reason})`;
		default:
			return "tokens: unavailable";
	}
}

export function formatTokenCount(count: number): string {
	if (count < 1000) return String(count);
	return `${(count / 1000).toFixed(1)}k`;
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

export function formatQuietSeconds(quietMs: number): number {
	return Math.max(0, Math.floor(quietMs / 1000));
}

export interface FleetTimelineRenderContext {
	sessionCwd?: string;
	homeDir?: string;
	/** Test-determinism seam only; production leaves it undefined for local time. */
	timeZone?: string;
}

export function renderTimelineEntryLines(
	entry: RunnerSubagentTimelineEntry,
	context: FleetTimelineRenderContext = {},
): string[] {
	const stamp = formatTimelineStamp(entry.timestampMs, context.timeZone);
	if (entry.kind === "assistant") return [`${stamp}● assistant: ${entry.text}`];
	const icon = entry.state === "running" ? "▶" : entry.state === "error" ? "✗" : "✓";
	const lines = [truncatePlain(`${stamp}${icon} ${toolRowText(entry, context)}`, 200)];
	if (entry.state === "error") {
		const result = formatToolPreview(entry.resultPreview);
		if (result !== undefined) {
			lines.push(truncatePlain(`${" ".repeat(stamp.length)}  ↳ ${result}`, 200));
		}
	}
	return lines;
}

function toolRowText(
	entry: RunnerSubagentTimelineToolEntry,
	context: FleetTimelineRenderContext,
): string {
	const presentation = fleetToolPresentation({
		toolName: entry.toolName,
		invocation: entry.invocation,
	});
	if (presentation?.kind === "path") {
		return `${entry.toolName} ${formatFleetDisplayPath(presentation.path, context)}`;
	}
	if (presentation?.kind === "command") return compactPlain(presentation.command);
	const input = formatToolPreview(entry.inputPreview);
	const suffix = input === undefined ? "" : ` · ${input}`;
	return `${entry.toolName}${suffix}`;
}

export function formatFleetDisplayPath(path: string, context: FleetTimelineRenderContext): string {
	if (!path.startsWith("/")) return path;
	const cwdRelative = stripPathPrefix(path, context.sessionCwd);
	if (cwdRelative !== undefined) return cwdRelative;
	const homeRelative = stripPathPrefix(path, context.homeDir);
	if (homeRelative !== undefined) return `~/${homeRelative}`;
	return path;
}

function stripPathPrefix(path: string, prefix: string | undefined): string | undefined {
	if (prefix === undefined || prefix.length === 0) return undefined;
	const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
	return path.startsWith(normalizedPrefix) ? path.slice(normalizedPrefix.length) : undefined;
}

const stampFormatters = new Map<string, Intl.DateTimeFormat>();

function formatTimelineStamp(
	timestampMs: number | undefined,
	timeZone: string | undefined,
): string {
	if (timestampMs === undefined) return "";
	const key = timeZone ?? "local";
	let formatter = stampFormatters.get(key);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
			...(timeZone === undefined ? {} : { timeZone }),
		});
		stampFormatters.set(key, formatter);
	}
	return `${formatter.format(new Date(timestampMs))} `;
}

export function renderFleetDetailHeaderLines(input: {
	entry: FleetNavigatorEntry | undefined;
	detail: SubagentFleetTaskDetail | undefined;
	nowMs: number;
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
		`${detail.state} · ${detail.status} · ${detail.modelText} · ${detail.turnCount} turns / ${detail.toolCount} tools · ${formatDetailDuration(detail.duration, input.nowMs)}`,
		usageLine(detail),
		`session: ${detail.sessionFile ?? "no session file yet"}`,
		...statusSlotLines(detail),
	];
}

export function statusSlotLines(detail: SubagentFleetTaskDetail): string[] {
	if (detail.postRunSummary !== undefined) {
		return [
			truncatePlain(
				`${detail.postRunSummary.status} · commit: ${formatCommitSummary(detail.postRunSummary.commit)}`,
				200,
			),
		];
	}
	const liveActivity = detail.liveActivity;
	if (liveActivity === undefined || liveActivity.currentAction.kind === "idle") return [];
	const action = liveActivity.currentAction;
	const quietSuffix =
		liveActivity.quietMs === undefined
			? ""
			: ` · quiet ${formatQuietSeconds(liveActivity.quietMs)}s`;
	if (action.kind === "thinking") {
		return [truncatePlain(`thinking / waiting for model output${quietSuffix}`, 200)];
	}
	const input = formatToolPreview(action.inputPreview);
	const inputSuffix = input === undefined ? "" : ` · ${input}`;
	const lines = [truncatePlain(`▶ ${action.toolName}${inputSuffix}${quietSuffix}`, 200)];
	if (action.resultPreview !== undefined) {
		lines.push(
			truncatePlain(`  ↳ ${formatToolPreview(action.resultPreview) ?? action.resultPreview}`, 200),
		);
	}
	return lines;
}

function formatDetailDuration(duration: SubagentFleetRunDuration, nowMs: number): string {
	switch (duration.kind) {
		case "completed":
			return formatRunnerSubagentElapsed(duration.elapsedMs);
		case "running":
			return formatRunnerSubagentElapsed(Math.max(0, nowMs - duration.startedAtMs));
		case "unknown":
			return "—";
		default: {
			const exhaustive: never = duration;
			return exhaustive;
		}
	}
}

export function renderFleetDetailContentLines(input: {
	detail: SubagentFleetTaskDetail;
	isPromptExpanded: boolean;
	timelineContext?: FleetTimelineRenderContext;
}): string[] {
	const detail = input.detail;
	const timelineContext = input.timelineContext ?? {};
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
	if (detail.timeline.droppedEntryCount > 0) {
		lines.push(`… ${detail.timeline.droppedEntryCount} earlier events dropped`);
	}
	for (const entry of detail.timeline.entries) {
		lines.push(...renderTimelineEntryLines(entry, timelineContext));
	}
	if (detail.timeline.entries.length === 0) {
		lines.push("No timeline events yet.");
	}
	if (detail.postRunSummary !== undefined) {
		lines.push("", `── run finished · ${detail.postRunSummary.status} ──`);
		if (detail.postRunSummary.lastDiagnostic !== undefined) {
			lines.push(truncatePlain(`last diagnostic: ${detail.postRunSummary.lastDiagnostic}`, 200));
		}
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

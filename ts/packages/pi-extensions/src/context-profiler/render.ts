/**
 * Pure rendering helpers for the context profiler: plain data in, exact-width
 * cells and strings out. No Theme and no TUI instance — the view applies
 * colors. Every cell truncates-then-pads to its column width so rows never
 * jitter across renders.
 */

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { ContextUsage } from "@earendil-works/pi-coding-agent";
import type {
	BaseMember,
	BaseRegion,
	EpisodeKind,
	EpisodeOutcome,
	LiveRegion,
	LiveTurn,
	MessagePart,
	NormalizedMessage,
	TokenCount,
	TurnCapInfo,
} from "./model.ts";
import type { SegmentationState } from "./segmentation.ts";

export const BAR_WIDTH = 14;
export const TOKENS_COLUMN_WIDTH = 8;
export const PERCENT_COLUMN_WIDTH = 5;
/** Wide enough for "● chat" plus a future delegation marker. */
export const STATUS_COLUMN_WIDTH = 8;
export const MIN_LABEL_WIDTH = 8;
/** Marker+space, label gap, and the two spaces before the status column. */
const OVERVIEW_ROW_SEPARATOR_WIDTH = 5;

export type Health = "neutral" | "muted" | "accent" | "warning" | "dim";

export const EPISODE_KIND_ABBREV = {
	explore: "exp",
	edit: "edit",
	debug: "dbg",
	test: "test",
	review: "rev",
	chat: "chat",
	uncategorized: "—",
} as const satisfies Record<EpisodeKind, string>;

export const EPISODE_OUTCOME_GLYPH = {
	active: "●",
	completed: "✓",
	abandoned: "✗",
	errored: "✗",
	unknown: "?",
} as const satisfies Record<EpisodeOutcome, string>;

export type OverviewRowSource =
	| { type: "base"; region: BaseRegion }
	| { type: "live"; region: LiveRegion };

export interface OverviewRowCells {
	/** Exact-width label cell (truncated then padded). */
	label: string;
	barFilled: string;
	barEmpty: string;
	/** Exact-width token column, ≈-prefixed when estimated. */
	tokens: string;
	/** Exact-width percent column. */
	percent: string;
	/** Exact-width status column (outcome glyph + kind abbrev for live rows). */
	status: string;
	health: Health;
}

export function overviewLabelWidth(innerWidth: number): number {
	return Math.max(
		MIN_LABEL_WIDTH,
		innerWidth - BAR_WIDTH - TOKENS_COLUMN_WIDTH - PERCENT_COLUMN_WIDTH - STATUS_COLUMN_WIDTH - OVERVIEW_ROW_SEPARATOR_WIDTH,
	);
}

export function buildOverviewRowCells(source: OverviewRowSource, maxTokens: number, totalTokens: number, innerWidth: number): OverviewRowCells {
	const region = source.region;
	const { filled, empty } = meterParts(region.tokens.value, maxTokens, BAR_WIDTH);
	const percentValue = Math.round((Math.max(0, region.tokens.value) / Math.max(1, totalTokens)) * 100);
	return {
		label: fitToWidth(regionRowLabel(source), overviewLabelWidth(innerWidth)),
		barFilled: filled,
		barEmpty: empty,
		tokens: formatTokenCount(region.tokens).padStart(TOKENS_COLUMN_WIDTH),
		percent: `${percentValue}%`.padStart(PERCENT_COLUMN_WIDTH),
		status: fitToWidth(rowStatus(source), STATUS_COLUMN_WIDTH),
		health: rowHealth(source),
	};
}

/** Composed plain-text row, used for the inverted selected-row rendering. */
export function composeOverviewRowText(cells: OverviewRowCells): string {
	return `▌ ${cells.label} ${cells.barFilled}${cells.barEmpty}${cells.tokens}${cells.percent}  ${cells.status}`;
}

function regionRowLabel(source: OverviewRowSource): string {
	if (source.type === "base") return source.region.label;
	return `${source.region.label} · ${source.region.turnRange.start}–${source.region.turnRange.end}`;
}

function rowStatus(source: OverviewRowSource): string {
	if (source.type === "base") return "";
	const region = source.region;
	if (region.outcome !== null) {
		return `${EPISODE_OUTCOME_GLYPH[region.outcome]} ${EPISODE_KIND_ABBREV[region.kind]}`;
	}
	const glyph = region.isCurrent ? "●" : "·";
	return `${glyph} ${EPISODE_KIND_ABBREV[region.kind]}`;
}

function rowHealth(source: OverviewRowSource): Health {
	if (source.type === "base") return "neutral";
	const region = source.region;
	if (region.outcome !== null) return healthForOutcome(region.outcome);
	if (region.isCurrent) return "accent";
	if (region.kind === "uncategorized") return "dim";
	return "neutral";
}

function healthForOutcome(outcome: EpisodeOutcome): Health {
	switch (outcome) {
		case "active":
			return "accent";
		case "completed":
			return "muted";
		case "abandoned":
		case "errored":
			return "warning";
		case "unknown":
			return "dim";
	}
}

export interface UsageBarSegments {
	baseWidth: number;
	liveWidth: number;
	freeWidth: number;
	baseLegend: string;
	liveLegend: string;
	freeLegend: string;
}

export function buildUsageBarSegments(usage: ContextUsage | undefined, baseTokens: number, liveTokens: number, innerWidth: number): UsageBarSegments {
	const estimated = baseTokens + liveTokens;
	const contextWindow = usage?.contextWindow ?? 0;
	const total = Math.max(1, contextWindow > 0 ? contextWindow : estimated);
	const used = clamp(usage?.tokens ?? estimated, 0, total);
	const baseWidth = clamp(Math.round((Math.min(baseTokens, used) / total) * innerWidth), 0, innerWidth);
	const liveWidth = clamp(Math.round((used / total) * innerWidth) - baseWidth, 0, innerWidth - baseWidth);
	return {
		baseWidth,
		liveWidth,
		freeWidth: Math.max(0, innerWidth - baseWidth - liveWidth),
		baseLegend: `base ${formatApproxTokens(baseTokens)}`,
		liveLegend: `live ${formatApproxTokens(liveTokens)}`,
		freeLegend: `free ${formatCompactNumber(Math.max(0, total - used))} tok`,
	};
}

export const BASE_SECTION_HEADER = "BASE · system prompt";

export function liveSectionHeader(cap: TurnCapInfo, segmentationStatus?: string | null): string {
	const elided = cap.elidedMiddleTurns > 0 ? ` · ${cap.elidedMiddleTurns.toLocaleString()} middle turns elided` : "";
	const status = segmentationStatus === undefined || segmentationStatus === null ? "" : ` · ${segmentationStatus}`;
	return `LIVE · ${cap.includedCount.toLocaleString()}/${cap.originalCount.toLocaleString()} turns${elided}${status}`;
}

/** Header status for the LM layer; null when there is nothing to surface. */
export function segmentationStatusText(state: SegmentationState): string | null {
	if (state.type === "loading") return "symbolizing…";
	if (state.type === "error") return `no symbols: ${state.message}`;
	return null;
}

export const BASE_DETAIL_CLAIM = "members sorted by estimated size, descending · ⏎ views content";

export function turnListClaim(region: LiveRegion): string {
	if (region.source === "annotation") {
		return `LM claim: kind=${region.kind} · outcome=${region.outcome ?? "unknown"} · turns ${region.turnRange.start}–${region.turnRange.end} · ⏎ views turn content`;
	}
	return `turns ${region.turnRange.start}–${region.turnRange.end} of this span, in order · ⏎ views turn content`;
}

export function scrollNote(firstVisible: number, lastVisible: number, total: number, unit: "rows" | "lines"): string {
	return `${unit} ${firstVisible.toLocaleString()}–${lastVisible.toLocaleString()} of ${total.toLocaleString()}`;
}

export interface ListRowCells {
	barFilled: string;
	barEmpty: string;
	/** Exact-width token column. */
	tokens: string;
	text: string;
}

export function buildListRowCells(tokens: TokenCount, text: string, maxTokens: number): ListRowCells {
	const { filled, empty } = meterParts(tokens.value, maxTokens, BAR_WIDTH);
	return {
		barFilled: filled,
		barEmpty: empty,
		tokens: formatTokenCount(tokens).padStart(TOKENS_COLUMN_WIDTH),
		text,
	};
}

export function composeListRowText(cells: ListRowCells): string {
	return `▌${cells.barFilled}${cells.barEmpty}${cells.tokens}  ${cells.text}`;
}

export function turnListRowText(turn: LiveTurn): string {
	const tools = turn.toolNames.length === 0 ? "" : ` [${turn.toolNames.join(",")}]`;
	return `t${turn.index} ${turn.role}${tools} · ${turn.excerpt}`;
}

export interface ContentSource {
	title: string;
	meta: string;
	note: string;
	text: string;
}

export function contentSourceForMember(member: BaseMember): ContentSource {
	if (member.content !== null) {
		return {
			title: member.name,
			meta: formatTokenCountLong(member.tokens),
			note: member.note ?? "verbatim captured text",
			text: sanitizeContentText(member.content),
		};
	}
	return {
		title: member.name,
		meta: formatTokenCountLong(member.tokens),
		note: "estimate only — raw text not captured",
		text: member.note ?? "This member's size is estimated; its raw text is not captured separately.",
	};
}

export function contentSourceForTurn(turn: LiveTurn): ContentSource {
	const tools = turn.toolNames.length === 0 ? "" : ` · ${turn.toolNames.join(",")}`;
	return {
		title: `t${turn.index} ${turn.role}${tools}`,
		meta: formatTokenCountLong(turn.tokens),
		note: "verbatim message content · tool args/results and details pretty-printed",
		text: sanitizeContentText(renderMessageText(turn.message)),
	};
}

/** Render a normalized message verbatim with semantic part headers. */
export function renderMessageText(message: NormalizedMessage): string {
	const sections: string[] = [];
	if (message.toolName !== null) sections.push(`⏺ tool result · ${message.toolName}`);
	sections.push(...message.parts.map(renderPartSection));
	if (message.detailsJson !== null) sections.push(`[details]\n${message.detailsJson}`);
	return sections.join("\n\n");
}

function renderPartSection(part: MessagePart): string {
	switch (part.kind) {
		case "text":
			return part.text;
		case "thinking":
			return `[thinking]\n${part.text}`;
		case "toolCall":
			return `⏺ ${part.name}\n${part.argsJson}`;
		case "image":
			return "[image]";
		case "opaque":
			return part.json;
	}
}

export function sanitizeContentText(text: string): string {
	return text.replace(/\r/g, "").replace(/\t/g, "  ");
}

export function formatUsage(usage: ContextUsage | undefined): string {
	if (usage === undefined) return "usage pending";
	if (usage.tokens === null) return `usage pending / ${formatCompactNumber(usage.contextWindow)}`;
	const percent = usage.percent === null ? "unknown" : `${usage.percent.toFixed(1)}%`;
	return `${formatCompactNumber(usage.tokens)} / ${formatCompactNumber(usage.contextWindow)} (${percent})`;
}

/** Estimated counts carry the ≈ prefix; reported counts render plain. */
export function formatTokenCount(count: TokenCount): string {
	const compact = formatCompactNumber(count.value);
	return count.provenance === "estimated" ? `≈${compact}` : compact;
}

export function formatTokenCountLong(count: TokenCount): string {
	return `${formatTokenCount(count)} tok`;
}

export function formatApproxTokens(value: number): string {
	return `≈${formatCompactNumber(value)} tok`;
}

export function formatCompactNumber(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
	return value.toLocaleString();
}

export function meterParts(value: number, maxValue: number, width: number): { filled: string; empty: string } {
	const filledCount = clamp(Math.round((Math.max(0, value) / Math.max(1, maxValue)) * width), 0, width);
	return { filled: "█".repeat(filledCount), empty: "░".repeat(width - filledCount) };
}

/** Truncate-then-pad to an exact display width (ANSI- and wide-glyph-aware). */
export function fitToWidth(text: string, width: number): string {
	return padRight(truncateToWidth(text, width, "…", true), width);
}

export function padRight(text: string, width: number): string {
	const missing = Math.max(0, width - visibleWidth(text));
	return text + " ".repeat(missing);
}

export function clamp(value: number, min: number, max: number): number {
	if (max < min) return min;
	return Math.max(min, Math.min(max, value));
}

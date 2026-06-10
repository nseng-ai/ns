/**
 * Frame-stack overlay component for the context profiler. Navigation is a
 * stack: overview is always the root frame; ⏎ pushes one level deeper
 * (base-region detail or turn list, then verbatim content), Esc pops (closing
 * from overview), `r` re-snapshots and resets to overview, `?` toggles the
 * help layer. The snapshot on screen is frozen; only `r` swaps it.
 */

import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { BaseMember, BaseRegion, DelegationClaim, LiveRegion, LiveTurn, ProfileSnapshot, TokenCount } from "./model.ts";
import { buildLiveRegions, delegationsInSpan, inferredDelegations, turnsInRange } from "./model.ts";
import type { EpisodeAnalysisStatus, SegmentationState } from "./segmentation.ts";
import {
	BASE_DETAIL_CLAIM,
	BASE_SECTION_HEADER,
	buildListRowCells,
	buildOverviewRowCells,
	buildUsageBarSegments,
	clamp,
	composeListRowText,
	composeOverviewRowText,
	contentSourceForMember,
	delegationSummaryLine,
	contentSourceForTurn,
	fitToWidth,
	formatTokenCountLong,
	formatUsage,
	listRowSegments,
	liveSectionHeader,
	overviewRowSegments,
	reconcileScroll,
	scrollNote,
	segmentationStatusText,
	turnListClaim,
	turnListRowText,
	type ContentSource,
	type Health,
	type OverviewRowCells,
	type OverviewRowSource,
	type RowSegment,
	type RowSegmentRole,
} from "./render.ts";

const FALLBACK_TERMINAL_ROWS = 24;
// Frame chrome around scrollable areas: 2 border rows + claim line + blank + hint line.
const LIST_CHROME_ROWS = 5;
const LIST_HINT = "↑↓/jk select · ⏎ open · PgUp/PgDn page · esc back · q close";
const CONTENT_HINT = "↑↓/jk/PgUp/PgDn scroll · esc back · q close";

type ProfilerThemeColor = "text" | "muted" | "accent" | "warning" | "dim";

interface OverviewFrame {
	type: "overview";
	selection: number;
	scroll: number;
}

interface BaseDetailFrame {
	type: "base-detail";
	region: BaseRegion;
	members: BaseMember[];
	selection: number;
	scroll: number;
	lastAreaHeight: number | null;
}

interface TurnListFrame {
	type: "turn-list";
	pushedRegion: LiveRegion;
	selection: number;
	scroll: number;
	lastAreaHeight: number | null;
}

interface ContentFrame {
	type: "content";
	source: ContentSource;
	scroll: number;
}

type ViewFrame = OverviewFrame | BaseDetailFrame | TurnListFrame | ContentFrame;

interface ListRow {
	tokens: TokenCount;
	text: string;
}

export interface ProfilerViewOptions {
	tui: TUI;
	theme: Theme;
	profile: ProfileSnapshot;
	segmentation: SegmentationState;
	onClose: () => void;
	/** Re-snapshot for `r`; the returned pair replaces the frozen one. */
	onRefresh: () => { profile: ProfileSnapshot; segmentation: SegmentationState };
}

export class ProfilerView implements Component {
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly onClose: () => void;
	private readonly onRefresh: () => { profile: ProfileSnapshot; segmentation: SegmentationState };
	private profile: ProfileSnapshot;
	private segmentation: SegmentationState;
	private frames: ViewFrame[];
	private isHelpVisible: boolean;

	constructor(options: ProfilerViewOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.onClose = options.onClose;
		this.onRefresh = options.onRefresh;
		this.profile = options.profile;
		this.segmentation = options.segmentation;
		this.frames = [{ type: "overview", selection: 0, scroll: 0 }];
		this.isHelpVisible = false;
	}

	/**
	 * Async segmentation arrival. The frozen snapshot is untouched — episodes
	 * are an annotation layer recomputed over it. The overview row count can
	 * change, but the selection is reconciled against the rendered rows at
	 * render time, so no clamp is needed here. Residual race (accepted): an
	 * Enter keypress processed during the one throttled render cycle after
	 * arrival resolves against the new rows while the old ones are still on
	 * screen — inherent to synchronous-input/deferred-render TUIs.
	 */
	setSegmentation(state: SegmentationState): void {
		this.segmentation = state;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const height = Math.max(8, this.terminalRows());
		const frame = this.topFrame();
		const body = this.renderFrameBody(frame, width, height);
		return this.boxed({ title: this.breadcrumbTitle(), meta: this.frameMeta(frame), body, width }).map((line) => fitToWidth(line, width));
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			if (this.frames.length > 1) {
				this.frames.pop();
				this.requestRender();
				return;
			}
			this.onClose();
			return;
		}
		if (data === "q") {
			this.onClose();
			return;
		}
		if (data === "?") {
			this.isHelpVisible = !this.isHelpVisible;
			this.requestRender();
			return;
		}
		if (data === "r") {
			const refreshed = this.onRefresh();
			this.profile = refreshed.profile;
			this.segmentation = refreshed.segmentation;
			this.frames = [{ type: "overview", selection: 0, scroll: 0 }];
			this.isHelpVisible = false;
			this.requestRender();
			return;
		}
		const frame = this.topFrame();
		switch (frame.type) {
			case "overview":
				this.handleOverviewInput(data, frame);
				return;
			case "base-detail":
				this.handleListInput({
					data,
					selection: frame.selection,
					count: frame.members.length,
					lastAreaHeight: frame.lastAreaHeight,
					onSelectionChange: (selection) => this.replaceFrame(frame, { ...frame, selection }),
					onEnter: () => this.openMemberContent(frame),
				});
				return;
			case "turn-list":
				this.handleListInput({
					data,
					selection: frame.selection,
					count: this.resolveTurnList(frame).turns.length,
					lastAreaHeight: frame.lastAreaHeight,
					onSelectionChange: (selection) => this.replaceFrame(frame, { ...frame, selection }),
					onEnter: () => this.openTurnContent(frame),
				});
				return;
			case "content":
				this.handleContentInput(data, frame);
				return;
		}
	}

	invalidate(): void {}

	private terminalRows(): number {
		return this.tui.terminal.rows ?? FALLBACK_TERMINAL_ROWS;
	}

	private listAreaHeight(): number {
		return Math.max(1, this.terminalRows() - LIST_CHROME_ROWS);
	}

	private topFrame(): ViewFrame {
		const frame = this.frames[this.frames.length - 1];
		// The constructor seeds the stack and pop is guarded by length > 1.
		if (frame === undefined) throw new Error("profiler frame stack is empty");
		return frame;
	}

	private replaceFrame(previous: ViewFrame, next: ViewFrame): void {
		const index = this.frames.lastIndexOf(previous);
		if (index === -1) throw new Error("profiler frame is no longer on the stack");
		this.frames = this.frames.map((candidate, candidateIndex) => candidateIndex === index ? next : candidate);
	}

	private overviewRows(): OverviewRowSource[] {
		return [
			...this.profile.baseRegions.map((region): OverviewRowSource => ({ type: "base", region })),
			...this.liveRegions().map((region): OverviewRowSource => ({ type: "live", region })),
		];
	}

	/**
	 * LIVE rows: ready episodes are recomputed as an annotation layer over the
	 * frozen snapshot's turns; every other state falls back to the snapshot's
	 * deterministic regions, so LM failure never blocks the view.
	 * `profile.liveRegions` is that deterministic fallback, and episode
	 * annotation happens only here — the view is the single annotation point.
	 */
	private liveRegions(): LiveRegion[] {
		if (this.segmentation.type === "ready" && this.segmentation.episodes.length > 0) {
			return buildLiveRegions(this.profile.liveTurns, this.segmentation.episodes);
		}
		return this.profile.liveRegions;
	}

	private currentDelegations(): DelegationClaim[] {
		return this.segmentation.type === "ready" ? [...this.segmentation.delegations] : inferredDelegations(this.profile.liveTurns);
	}

	private resolveTurnList(frame: TurnListFrame): { region: LiveRegion; turns: LiveTurn[] } {
		const region = this.liveRegions().find((candidate) => candidate.id === frame.pushedRegion.id) ?? frame.pushedRegion;
		return { region, turns: turnsInRange(this.profile.liveTurns, region.turnRange) };
	}

	private analysisStatusTextForRegion(region: LiveRegion): string | null {
		const status = this.analysisStatusForRegion(region);
		if (status === null || status === "ready") return null;
		if (status === "loading") return "analysis: …";
		return `analysis failed: ${status.message}`;
	}

	private analysisStatusForRegion(region: LiveRegion): EpisodeAnalysisStatus | null {
		if (this.segmentation.type !== "ready") return null;
		if (region.episodeIndex === null) return null;
		return this.segmentation.analysis[region.episodeIndex] ?? null;
	}

	private breadcrumbTitle(): string {
		const crumbs = this.frames.flatMap((frame): string[] => {
			switch (frame.type) {
				case "overview":
					return [];
				case "base-detail":
					return [frame.region.label];
				case "turn-list":
					return [this.resolveTurnList(frame).region.label];
				case "content":
					return [frame.source.title];
			}
		});
		return ["context profiler", ...crumbs].join(" › ");
	}

	private frameMeta(frame: ViewFrame): string {
		switch (frame.type) {
			case "overview":
				return formatUsage(this.profile.usage);
			case "base-detail":
				return formatTokenCountLong(frame.region.tokens);
			case "turn-list":
				return formatTokenCountLong(this.resolveTurnList(frame).region.tokens);
			case "content":
				return frame.source.meta;
		}
	}

	private renderFrameBody(frame: ViewFrame, width: number, height: number): string[] {
		const innerWidth = frameInnerWidth(width);
		const bodyHeight = Math.max(3, height - 2);
		switch (frame.type) {
			case "overview":
				return this.renderOverviewBody(frame, innerWidth, bodyHeight);
			case "base-detail":
				return this.composeListBody({
					claim: BASE_DETAIL_CLAIM,
					rows: frame.members.map((member): ListRow => ({ tokens: member.tokens, text: member.name })),
					state: frame,
					onReconcile: (next) => this.replaceFrame(frame, { ...frame, ...next }),
					emptyText: "no base members captured",
					innerWidth,
					bodyHeight,
				});
			case "turn-list": {
				const { region, turns } = this.resolveTurnList(frame);
				const delegations = delegationsInSpan(this.currentDelegations(), region.turnRange);
				const delegatingTurns = new Set(delegations.map((claim) => claim.turn));
				return this.composeListBody({
					claim: turnListClaim(region, { analysisStatus: this.analysisStatusTextForRegion(region), delegationCount: delegations.length }),
					// The opinionated summary renders in full (prompt-steered length, no
					// renderer truncation); the turn rows scroll beneath it.
					summaryLines: region.analysisSummary === undefined ? [] : wrapTextWithAnsi(region.analysisSummary, innerWidth),
					headerLines: delegations.length === 0 ? [] : [delegationSummaryLine(delegations)],
					rows: turns.map((turn): ListRow => ({ tokens: turn.tokens, text: turnListRowText(turn, delegatingTurns.has(turn.index)) })),
					state: frame,
					onReconcile: (next) => this.replaceFrame(frame, { ...frame, ...next }),
					emptyText: "no turns in this span",
					innerWidth,
					bodyHeight,
				});
			}
			case "content":
				return this.composeContentBody(frame, innerWidth, bodyHeight);
		}
	}

	private renderOverviewBody(frame: OverviewFrame, innerWidth: number, bodyHeight: number): string[] {
		const rows = this.overviewRows();
		// Async segmentation arrival can shrink/grow the row set between input
		// and render, so the selection is re-clamped here against the rows
		// actually drawn (input-time clamps only cover synchronous changes).
		const selection = clamp(frame.selection, 0, Math.max(0, rows.length - 1));
		const liveRegions = this.liveRegions();
		const baseTokens = this.profile.baseRegions.reduce((total, region) => total + Math.max(0, region.tokens.value), 0);
		const liveTokens = liveRegions.reduce((total, region) => total + Math.max(0, region.tokens.value), 0);
		const totalTokens = Math.max(1, baseTokens + liveTokens);
		const maxTokens = Math.max(1, ...rows.map((row) => row.region.tokens.value));
		const lines: string[] = [];
		let selectedLine = 0;
		lines.push(...this.renderUsageBar(baseTokens, liveTokens, innerWidth));
		lines.push("");
		lines.push(this.sectionHeader(BASE_SECTION_HEADER, innerWidth));
		rows.forEach((row, index) => {
			if (row.type !== "base") return;
			if (index === selection) selectedLine = lines.length;
			lines.push(this.renderOverviewRow(row, { isSelected: index === selection, maxTokens, totalTokens, innerWidth }));
		});
		lines.push("");
		lines.push(this.sectionHeader(liveSectionHeader(this.profile.cap, segmentationStatusText(this.segmentation)), innerWidth));
		if (this.segmentation.type === "ready" && this.segmentation.summary !== null) {
			for (const line of wrapTextWithAnsi(this.segmentation.summary, innerWidth)) {
				lines.push(this.theme.fg("dim", line));
			}
		}
		if (liveRegions.length === 0) lines.push(this.theme.fg("dim", "no live conversation turns yet"));
		rows.forEach((row, index) => {
			if (row.type !== "live") return;
			if (index === selection) selectedLine = lines.length;
			lines.push(this.renderOverviewRow(row, { isSelected: index === selection, maxTokens, totalTokens, innerWidth }));
		});
		if (this.isHelpVisible) {
			lines.push("");
			lines.push(this.theme.fg("dim", "≈ sizes are chars/4 estimates and need not sum to the measured total."));
			lines.push(this.theme.fg("dim", "⇄ marks delegation claims; (inferred) marks the deterministic tool-name heuristic."));
			lines.push(this.theme.fg("dim", `opened ${this.profile.openedAt} · source ${this.profile.liveSource} · model ${this.profile.model}`));
			lines.push(this.theme.fg("dim", "bars are scaled to the largest visible row; ⏎ zooms one level into the selection."));
		}
		const areaHeight = Math.max(1, bodyHeight - 1);
		// Scroll is reconciled at render time because it depends on layout. The
		// whole heterogeneous body scrolls as one window; anchoring the first
		// row to line 0 keeps the usage bar and headers visible at the top.
		const anchorLine = selection === 0 ? 0 : selectedLine;
		const scroll = reconcileScroll({ scroll: frame.scroll, anchor: anchorLine, areaHeight, totalLines: lines.length });
		this.replaceFrame(frame, { ...frame, selection, scroll });
		const visible = lines.slice(scroll, scroll + areaHeight);
		const note = lines.length > areaHeight
			? `${scrollNote(scroll + 1, Math.min(lines.length, scroll + areaHeight), lines.length, "lines")} · `
			: "";
		const hint = this.theme.fg("dim", `${note}↑↓/jk select · ⏎ zoom · r refresh · ? ${this.isHelpVisible ? "hide help" : "help"} · esc/q close`);
		return pinFooter(visible, hint, bodyHeight);
	}

	private renderUsageBar(baseTokens: number, liveTokens: number, innerWidth: number): string[] {
		const segments = buildUsageBarSegments(this.profile.usage, { baseTokens, liveTokens, innerWidth });
		const bar = this.theme.fg("muted", "█".repeat(segments.baseWidth))
			+ this.theme.fg("accent", "█".repeat(segments.liveWidth))
			+ this.theme.fg("dim", "░".repeat(segments.freeWidth));
		const legend = [
			this.theme.fg("muted", "█") + this.theme.fg("dim", ` ${segments.baseLegend}`),
			this.theme.fg("accent", "█") + this.theme.fg("dim", ` ${segments.liveLegend}`),
			this.theme.fg("dim", `░ ${segments.freeLegend}`),
		].join("   ");
		return [bar, legend];
	}

	private sectionHeader(text: string, innerWidth: number): string {
		return this.theme.bold(this.theme.fg("muted", truncateToWidth(text, innerWidth, "…", true)));
	}

	private renderOverviewRow(source: OverviewRowSource, options: { isSelected: boolean; maxTokens: number; totalTokens: number; innerWidth: number }): string {
		const { isSelected, maxTokens, totalTokens, innerWidth } = options;
		const hasDelegation = source.type === "live" && delegationsInSpan(this.currentDelegations(), source.region.turnRange).length > 0;
		const cells = buildOverviewRowCells(source, { maxTokens, totalTokens, innerWidth, hasDelegation });
		if (isSelected) {
			return this.theme.bg("selectedBg", fitToWidth(composeOverviewRowText(cells), innerWidth));
		}
		return this.renderRowSegments("  ", overviewRowSegments(cells), (role) => overviewColorForRole(role, cells));
	}

	private composeListBody(options: {
		claim: string;
		/** Pre-wrapped prose block rendered in full between the claim and header lines. */
		summaryLines?: readonly string[];
		headerLines?: readonly string[];
		rows: readonly ListRow[];
		state: { selection: number; scroll: number };
		onReconcile: (next: { selection: number; scroll: number; lastAreaHeight: number }) => void;
		emptyText: string;
		innerWidth: number;
		bodyHeight: number;
	}): string[] {
		const summaryLines = options.summaryLines ?? [];
		const headerLines = options.headerLines ?? [];
		const areaHeight = Math.max(1, options.bodyHeight - 3 - summaryLines.length - headerLines.length);
		const count = options.rows.length;
		// Derived row counts can shrink between input and render, so mirror the overview's render-time reclamp.
		const selection = clamp(options.state.selection, 0, Math.max(0, count - 1));
		const scroll = reconcileScroll({ scroll: options.state.scroll, anchor: selection, areaHeight, totalLines: count });
		options.onReconcile({ selection, scroll, lastAreaHeight: areaHeight });
		const maxTokens = Math.max(1, ...options.rows.map((row) => row.tokens.value));
		const visible = options.rows
			.slice(scroll, scroll + areaHeight)
			.map((row, offset) =>
				this.renderListRow(row, { isSelected: scroll + offset === selection, maxTokens, innerWidth: options.innerWidth }));
		const body = visible.length === 0 ? [this.theme.fg("dim", options.emptyText)] : visible;
		const proseSummaryLines = summaryLines.map((line) => this.theme.fg("text", line));
		const dimHeaderLines = headerLines.map((line) => this.theme.fg("dim", truncateToWidth(line, options.innerWidth, "…", true)));
		const lines = [this.theme.fg("dim", truncateToWidth(options.claim, options.innerWidth, "…", true)), ...proseSummaryLines, ...dimHeaderLines, "", ...body];
		const note = count > areaHeight ? `${scrollNote(scroll + 1, Math.min(count, scroll + areaHeight), count, "rows")} · ` : "";
		return pinFooter(lines, this.theme.fg("dim", `${note}${LIST_HINT}`), options.bodyHeight);
	}

	private renderListRow(row: ListRow, options: { isSelected: boolean; maxTokens: number; innerWidth: number }): string {
		const { isSelected, maxTokens, innerWidth } = options;
		const cells = buildListRowCells(row.tokens, row.text, maxTokens);
		if (isSelected) {
			return this.theme.bg("selectedBg", fitToWidth(composeListRowText(cells), innerWidth));
		}
		return this.renderRowSegments(" ", listRowSegments(cells), listColorForRole);
	}

	private renderRowSegments(marker: string, segments: readonly RowSegment[], colorFor: (role: RowSegmentRole) => ProfilerThemeColor | null): string {
		return marker + segments
			.map((segment) => {
				const color = colorFor(segment.role);
				return color === null ? segment.text : this.theme.fg(color, segment.text);
			})
			.join("");
	}

	private composeContentBody(frame: ContentFrame, innerWidth: number, bodyHeight: number): string[] {
		const areaHeight = Math.max(1, bodyHeight - 3);
		const wrapped = frame.source.text.trim().length === 0 ? [this.theme.fg("dim", "(empty)")] : wrapTextWithAnsi(frame.source.text, innerWidth);
		const maxScroll = Math.max(0, wrapped.length - areaHeight);
		// Scroll is reconciled at render time because it depends on layout (wrap width / area height).
		const scroll = clamp(frame.scroll, 0, maxScroll);
		this.replaceFrame(frame, { ...frame, scroll });
		const visible = wrapped.slice(scroll, scroll + areaHeight);
		const lines = [this.theme.fg("dim", truncateToWidth(frame.source.note, innerWidth, "…", true)), "", ...visible];
		const note = maxScroll > 0 ? `${scrollNote(scroll + 1, Math.min(wrapped.length, scroll + areaHeight), wrapped.length, "lines")} · ` : "";
		return pinFooter(lines, this.theme.fg("dim", `${note}${CONTENT_HINT}`), bodyHeight);
	}

	private boxed(options: { title: string; meta: string; body: readonly string[]; width: number }): string[] {
		const boxWidth = Math.max(24, options.width);
		const innerWidth = boxWidth - 4;
		const border = (text: string) => this.theme.fg("border", text);
		const title = truncateToWidth(` ${options.title} `, Math.max(4, innerWidth - 8), "…");
		const metaBudget = Math.max(0, boxWidth - 4 - visibleWidth(title) - 2);
		const meta = options.meta.length === 0 ? "" : truncateToWidth(` ${options.meta} `, metaBudget, "…");
		const fillerWidth = Math.max(0, boxWidth - 4 - visibleWidth(title) - visibleWidth(meta));
		const top = border("╭─") + this.theme.fg("accent", this.theme.bold(title)) + border("─".repeat(fillerWidth)) + this.theme.fg("muted", meta)
			+ border("─╮");
		const bottom = border(`╰${"─".repeat(boxWidth - 2)}╯`);
		const rows = options.body.map((line) => border("│ ") + fitToWidth(line, innerWidth) + border(" │"));
		return [top, ...rows, bottom];
	}

	private handleOverviewInput(data: string, frame: OverviewFrame): void {
		const rows = this.overviewRows();
		if (matchesKey(data, Key.up) || data === "k") {
			this.replaceFrame(frame, { ...frame, selection: clamp(frame.selection - 1, 0, Math.max(0, rows.length - 1)) });
			this.requestRender();
			return;
		}
		if (matchesKey(data, Key.down) || data === "j") {
			this.replaceFrame(frame, { ...frame, selection: clamp(frame.selection + 1, 0, Math.max(0, rows.length - 1)) });
			this.requestRender();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			const row = rows[frame.selection];
			if (row !== undefined) {
				this.pushRowFrame(row);
				this.requestRender();
			}
		}
	}

	private handleListInput(options: {
		data: string;
		selection: number;
		count: number;
		lastAreaHeight: number | null;
		onSelectionChange: (selection: number) => void;
		onEnter: () => void;
	}): void {
		const { data, selection, count, onEnter, onSelectionChange } = options;
		const page = options.lastAreaHeight ?? this.listAreaHeight();
		const maxSelection = Math.max(0, count - 1);
		if (matchesKey(data, Key.up) || data === "k") onSelectionChange(clamp(selection - 1, 0, maxSelection));
		else if (matchesKey(data, Key.down) || data === "j") onSelectionChange(clamp(selection + 1, 0, maxSelection));
		else if (matchesKey(data, Key.pageUp)) onSelectionChange(clamp(selection - page, 0, maxSelection));
		else if (matchesKey(data, Key.pageDown)) onSelectionChange(clamp(selection + page, 0, maxSelection));
		else if (matchesKey(data, Key.enter)) onEnter();
		else return;
		this.requestRender();
	}

	private handleContentInput(data: string, frame: ContentFrame): void {
		const page = this.listAreaHeight();
		if (matchesKey(data, Key.up) || data === "k") this.replaceFrame(frame, { ...frame, scroll: Math.max(0, frame.scroll - 1) });
		else if (matchesKey(data, Key.down) || data === "j") this.replaceFrame(frame, { ...frame, scroll: frame.scroll + 1 });
		else if (matchesKey(data, Key.pageUp)) this.replaceFrame(frame, { ...frame, scroll: Math.max(0, frame.scroll - page) });
		else if (matchesKey(data, Key.pageDown)) this.replaceFrame(frame, { ...frame, scroll: frame.scroll + page });
		else return;
		this.requestRender();
	}

	private pushRowFrame(row: OverviewRowSource): void {
		if (row.type === "base") {
			const members = [...row.region.members].sort((left, right) => right.tokens.value - left.tokens.value);
			this.frames.push({ type: "base-detail", region: row.region, members, selection: 0, scroll: 0, lastAreaHeight: null });
			return;
		}
		this.frames.push({
			type: "turn-list",
			pushedRegion: row.region,
			selection: 0,
			scroll: 0,
			lastAreaHeight: null,
		});
	}

	private openMemberContent(frame: BaseDetailFrame): void {
		const member = frame.members[frame.selection];
		if (member === undefined) return;
		this.frames.push({ type: "content", source: contentSourceForMember(member), scroll: 0 });
	}

	private openTurnContent(frame: TurnListFrame): void {
		const turn = this.resolveTurnList(frame).turns[frame.selection];
		if (turn === undefined) return;
		this.frames.push({ type: "content", source: contentSourceForTurn(turn), scroll: 0 });
	}

	private requestRender(): void {
		this.tui.requestRender();
	}
}

function frameInnerWidth(width: number): number {
	return Math.max(16, width - 4);
}

function pinFooter(lines: readonly string[], footer: string, bodyHeight: number): string[] {
	const area = Math.max(1, bodyHeight - 1);
	const clipped = lines.slice(0, area);
	const padding = Array.from({ length: Math.max(0, area - clipped.length) }, () => "");
	return [...clipped, ...padding, footer];
}

function overviewColorForRole(role: RowSegmentRole, cells: OverviewRowCells): ProfilerThemeColor | null {
	if (role === "gap") return null;
	if (role === "barEmpty") return "dim";
	if (role === "tokens" || role === "percent") return "muted";
	return themeColorForHealth(cells.health);
}

function listColorForRole(role: RowSegmentRole): ProfilerThemeColor | null {
	if (role === "gap") return null;
	if (role === "barFilled") return "accent";
	if (role === "barEmpty") return "dim";
	if (role === "tokens") return "muted";
	return "text";
}

function themeColorForHealth(health: Health): ProfilerThemeColor {
	if (health === "warning") return "warning";
	if (health === "accent") return "accent";
	if (health === "muted") return "muted";
	if (health === "dim") return "dim";
	return "text";
}

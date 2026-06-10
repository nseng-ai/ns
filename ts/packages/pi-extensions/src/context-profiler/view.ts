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
import type { BaseMember, BaseRegion, LiveRegion, LiveTurn, ProfileSnapshot, TokenCount } from "./model.ts";
import { buildLiveRegions, turnsInRange } from "./model.ts";
import type { SegmentationState } from "./segmentation.ts";
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
	contentSourceForTurn,
	fitToWidth,
	formatTokenCountLong,
	formatUsage,
	liveSectionHeader,
	scrollNote,
	segmentationStatusText,
	turnListClaim,
	turnListRowText,
	type ContentSource,
	type Health,
	type OverviewRowSource,
} from "./render.ts";

const FALLBACK_TERMINAL_ROWS = 24;
// Frame chrome around scrollable areas: 2 border rows + claim line + blank + hint line.
const LIST_CHROME_ROWS = 5;
const LIST_HINT = "↑↓ select · ⏎ open · PgUp/PgDn page · esc back · q close";
const CONTENT_HINT = "↑↓/PgUp/PgDn scroll · esc back · q close";

interface OverviewFrame {
	type: "overview";
	selection: number;
}

interface BaseDetailFrame {
	type: "base-detail";
	region: BaseRegion;
	members: BaseMember[];
	selection: number;
	scroll: number;
}

interface TurnListFrame {
	type: "turn-list";
	region: LiveRegion;
	turns: LiveTurn[];
	selection: number;
	scroll: number;
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
	private showHelp: boolean;

	constructor(options: ProfilerViewOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.onClose = options.onClose;
		this.onRefresh = options.onRefresh;
		this.profile = options.profile;
		this.segmentation = options.segmentation;
		this.frames = [{ type: "overview", selection: 0 }];
		this.showHelp = false;
	}

	/**
	 * Async segmentation arrival. The frozen snapshot is untouched — episodes
	 * are an annotation layer recomputed over it — but the overview row count
	 * can change, so the root selection is re-clamped.
	 */
	setSegmentation(state: SegmentationState): void {
		this.segmentation = state;
		const root = this.frames[0];
		if (root !== undefined && root.type === "overview") {
			root.selection = clamp(root.selection, 0, Math.max(0, this.overviewRows().length - 1));
		}
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
			this.showHelp = !this.showHelp;
			this.requestRender();
			return;
		}
		if (data === "r") {
			const refreshed = this.onRefresh();
			this.profile = refreshed.profile;
			this.segmentation = refreshed.segmentation;
			this.frames = [{ type: "overview", selection: 0 }];
			this.showHelp = false;
			this.requestRender();
			return;
		}
		const frame = this.topFrame();
		switch (frame.type) {
			case "overview":
				this.handleOverviewInput(data, frame);
				return;
			case "base-detail":
				this.handleListInput(data, frame, frame.members.length, () => this.openMemberContent(frame));
				return;
			case "turn-list":
				this.handleListInput(data, frame, frame.turns.length, () => this.openTurnContent(frame));
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
	 */
	private liveRegions(): LiveRegion[] {
		if (this.segmentation.type === "ready" && this.segmentation.episodes.length > 0) {
			return buildLiveRegions(this.profile.liveTurns, this.segmentation.episodes);
		}
		return this.profile.liveRegions;
	}

	private breadcrumbTitle(): string {
		const crumbs = this.frames.flatMap((frame): string[] => {
			switch (frame.type) {
				case "overview":
					return [];
				case "base-detail":
					return [frame.region.label];
				case "turn-list":
					return [frame.region.label];
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
				return formatTokenCountLong(frame.region.tokens);
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
					emptyText: "no base members captured",
					innerWidth,
					bodyHeight,
				});
			case "turn-list":
				return this.composeListBody({
					claim: turnListClaim(frame.region),
					rows: frame.turns.map((turn): ListRow => ({ tokens: turn.tokens, text: turnListRowText(turn) })),
					state: frame,
					emptyText: "no turns in this span",
					innerWidth,
					bodyHeight,
				});
			case "content":
				return this.composeContentBody(frame, innerWidth, bodyHeight);
		}
	}

	private renderOverviewBody(frame: OverviewFrame, innerWidth: number, bodyHeight: number): string[] {
		const rows = this.overviewRows();
		const liveRegions = this.liveRegions();
		const baseTokens = this.profile.baseRegions.reduce((total, region) => total + Math.max(0, region.tokens.value), 0);
		const liveTokens = liveRegions.reduce((total, region) => total + Math.max(0, region.tokens.value), 0);
		const totalTokens = Math.max(1, baseTokens + liveTokens);
		const maxTokens = Math.max(1, ...rows.map((row) => row.region.tokens.value));
		const lines: string[] = [];
		lines.push(...this.renderUsageBar(baseTokens, liveTokens, innerWidth));
		lines.push("");
		lines.push(this.sectionHeader(BASE_SECTION_HEADER, innerWidth));
		rows.forEach((row, index) => {
			if (row.type !== "base") return;
			lines.push(this.renderOverviewRow(row, index === frame.selection, maxTokens, totalTokens, innerWidth));
		});
		lines.push("");
		lines.push(this.sectionHeader(liveSectionHeader(this.profile.cap, segmentationStatusText(this.segmentation)), innerWidth));
		if (this.segmentation.type === "ready" && this.segmentation.summary !== null) {
			lines.push(this.theme.fg("dim", truncateToWidth(this.segmentation.summary, innerWidth, "…", true)));
		}
		if (liveRegions.length === 0) lines.push(this.theme.fg("dim", "no live conversation turns yet"));
		rows.forEach((row, index) => {
			if (row.type !== "live") return;
			lines.push(this.renderOverviewRow(row, index === frame.selection, maxTokens, totalTokens, innerWidth));
		});
		if (this.showHelp) {
			lines.push("");
			lines.push(this.theme.fg("dim", "≈ sizes are chars/4 estimates and need not sum to the measured total."));
			lines.push(this.theme.fg("dim", `opened ${this.profile.openedAt} · source ${this.profile.liveSource} · model ${this.profile.model}`));
			lines.push(this.theme.fg("dim", "bars are scaled to the largest visible row; ⏎ zooms one level into the selection."));
		}
		const hint = this.theme.fg("dim", `↑↓ select · ⏎ zoom · r refresh · ? ${this.showHelp ? "hide help" : "help"} · esc/q close`);
		return pinFooter(lines, hint, bodyHeight);
	}

	private renderUsageBar(baseTokens: number, liveTokens: number, innerWidth: number): string[] {
		const segments = buildUsageBarSegments(this.profile.usage, baseTokens, liveTokens, innerWidth);
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

	private renderOverviewRow(source: OverviewRowSource, isSelected: boolean, maxTokens: number, totalTokens: number, innerWidth: number): string {
		const cells = buildOverviewRowCells(source, maxTokens, totalTokens, innerWidth);
		if (isSelected) {
			return this.theme.bg("selectedBg", fitToWidth(composeOverviewRowText(cells), innerWidth));
		}
		const color = themeColorForHealth(cells.health);
		return `  ${this.theme.fg(color, cells.label)} ${this.theme.fg(color, cells.barFilled)}${this.theme.fg("dim", cells.barEmpty)}${
			this.theme.fg("muted", cells.tokens)
		}${this.theme.fg("muted", cells.percent)}  ${this.theme.fg(color, cells.status)}`;
	}

	private composeListBody(options: {
		claim: string;
		rows: readonly ListRow[];
		state: { selection: number; scroll: number };
		emptyText: string;
		innerWidth: number;
		bodyHeight: number;
	}): string[] {
		const areaHeight = Math.max(1, options.bodyHeight - 3);
		const count = options.rows.length;
		const state = options.state;
		// Selection is clamped at input time; scroll is reconciled at render time because it depends on layout.
		state.scroll = clamp(state.scroll, state.selection - areaHeight + 1, state.selection);
		state.scroll = clamp(state.scroll, 0, Math.max(0, count - areaHeight));
		const maxTokens = Math.max(1, ...options.rows.map((row) => row.tokens.value));
		const visible = options.rows
			.slice(state.scroll, state.scroll + areaHeight)
			.map((row, offset) => this.renderListRow(row, state.scroll + offset === state.selection, maxTokens, options.innerWidth));
		const body = visible.length === 0 ? [this.theme.fg("dim", options.emptyText)] : visible;
		const lines = [this.theme.fg("dim", truncateToWidth(options.claim, options.innerWidth, "…", true)), "", ...body];
		const note = count > areaHeight ? `${scrollNote(state.scroll + 1, Math.min(count, state.scroll + areaHeight), count, "rows")} · ` : "";
		return pinFooter(lines, this.theme.fg("dim", `${note}${LIST_HINT}`), options.bodyHeight);
	}

	private renderListRow(row: ListRow, isSelected: boolean, maxTokens: number, innerWidth: number): string {
		const cells = buildListRowCells(row.tokens, row.text, maxTokens);
		if (isSelected) {
			return this.theme.bg("selectedBg", fitToWidth(composeListRowText(cells), innerWidth));
		}
		return ` ${this.theme.fg("accent", cells.barFilled)}${this.theme.fg("dim", cells.barEmpty)}${this.theme.fg("muted", cells.tokens)}  ${
			this.theme.fg("text", cells.text)
		}`;
	}

	private composeContentBody(frame: ContentFrame, innerWidth: number, bodyHeight: number): string[] {
		const areaHeight = Math.max(1, bodyHeight - 3);
		const wrapped = frame.source.text.trim().length === 0 ? [this.theme.fg("dim", "(empty)")] : wrapTextWithAnsi(frame.source.text, innerWidth);
		const maxScroll = Math.max(0, wrapped.length - areaHeight);
		// Scroll is reconciled at render time because it depends on layout (wrap width / area height).
		frame.scroll = clamp(frame.scroll, 0, maxScroll);
		const visible = wrapped.slice(frame.scroll, frame.scroll + areaHeight);
		const lines = [this.theme.fg("dim", truncateToWidth(frame.source.note, innerWidth, "…", true)), "", ...visible];
		const note = maxScroll > 0 ? `${scrollNote(frame.scroll + 1, Math.min(wrapped.length, frame.scroll + areaHeight), wrapped.length, "lines")} · ` : "";
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
		if (matchesKey(data, Key.up)) {
			frame.selection = clamp(frame.selection - 1, 0, Math.max(0, rows.length - 1));
			this.requestRender();
			return;
		}
		if (matchesKey(data, Key.down)) {
			frame.selection = clamp(frame.selection + 1, 0, Math.max(0, rows.length - 1));
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

	private handleListInput(data: string, state: { selection: number; scroll: number }, count: number, onEnter: () => void): void {
		const page = this.listAreaHeight();
		const maxSelection = Math.max(0, count - 1);
		if (matchesKey(data, Key.up)) state.selection = clamp(state.selection - 1, 0, maxSelection);
		else if (matchesKey(data, Key.down)) state.selection = clamp(state.selection + 1, 0, maxSelection);
		else if (matchesKey(data, Key.pageUp)) state.selection = clamp(state.selection - page, 0, maxSelection);
		else if (matchesKey(data, Key.pageDown)) state.selection = clamp(state.selection + page, 0, maxSelection);
		else if (matchesKey(data, Key.enter)) onEnter();
		else return;
		this.requestRender();
	}

	private handleContentInput(data: string, frame: ContentFrame): void {
		const page = this.listAreaHeight();
		if (matchesKey(data, Key.up)) frame.scroll = Math.max(0, frame.scroll - 1);
		else if (matchesKey(data, Key.down)) frame.scroll++;
		else if (matchesKey(data, Key.pageUp)) frame.scroll = Math.max(0, frame.scroll - page);
		else if (matchesKey(data, Key.pageDown)) frame.scroll += page;
		else return;
		this.requestRender();
	}

	private pushRowFrame(row: OverviewRowSource): void {
		if (row.type === "base") {
			const members = [...row.region.members].sort((left, right) => right.tokens.value - left.tokens.value);
			this.frames.push({ type: "base-detail", region: row.region, members, selection: 0, scroll: 0 });
			return;
		}
		this.frames.push({
			type: "turn-list",
			region: row.region,
			turns: turnsInRange(this.profile.liveTurns, row.region.turnRange),
			selection: 0,
			scroll: 0,
		});
	}

	private openMemberContent(frame: BaseDetailFrame): void {
		const member = frame.members[frame.selection];
		if (member === undefined) return;
		this.frames.push({ type: "content", source: contentSourceForMember(member), scroll: 0 });
	}

	private openTurnContent(frame: TurnListFrame): void {
		const turn = frame.turns[frame.selection];
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

function themeColorForHealth(health: Health): "text" | "muted" | "accent" | "warning" | "dim" {
	if (health === "warning") return "warning";
	if (health === "accent") return "accent";
	if (health === "muted") return "muted";
	if (health === "dim") return "dim";
	return "text";
}

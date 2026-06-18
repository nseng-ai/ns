import type { StyledText, TextChunk } from "@opentui/core";

import { bold, dim, fg, highlightRow, joinLines, pad, PALETTE, plain } from "./frame-style.ts";
import type { StackMapModel, StackMapBranchNode } from "./stack-map.ts";

export type DashboardStatusBucket = "here" | "active" | "selected" | "idle/open" | "multi-surface" | "unmatched-branch" | "diagnostic";

export interface DashboardSurface {
	readonly ref: string;
	readonly title: string;
	readonly type: string;
	readonly tty?: string | undefined;
	readonly active: boolean;
	readonly focused: boolean;
	readonly here: boolean;
	readonly selected: boolean;
	readonly selectedInPane: boolean;
	readonly branch?: string | undefined;
	readonly worktreePath?: string | undefined;
	readonly workspaceRef: string;
	readonly windowRef: string;
	readonly paneRef: string;
}

export interface DashboardPane {
	readonly ref: string;
	readonly active: boolean;
	readonly focused: boolean;
	readonly selectedSurfaceRef?: string | undefined;
	readonly surfaces: readonly DashboardSurface[];
}

export interface DashboardWorkspace {
	readonly ref: string;
	readonly title: string;
	readonly description?: string | undefined;
	readonly index: number;
	readonly active: boolean;
	readonly selected: boolean;
	readonly pinned: boolean;
	readonly panes: readonly DashboardPane[];
	readonly surfaces: readonly DashboardSurface[];
	readonly statusBuckets: DashboardStatusBucket[];
	readonly branchEvidence: readonly string[];
	readonly diagnostics: readonly string[];
	readonly matchSummary?: string | undefined;
}

export interface DashboardWindow {
	readonly ref: string;
	readonly key?: string | undefined;
	readonly index: number;
	readonly active: boolean;
	readonly current: boolean;
	readonly visible: boolean;
	readonly selectedWorkspaceRef?: string | undefined;
	readonly workspaces: readonly DashboardWorkspace[];
	readonly diagnostic?: string | undefined;
}

export interface DashboardModel {
	readonly title: string;
	readonly windows: readonly DashboardWindow[];
	readonly selectedWindowRef?: string | undefined;
	readonly diagnostics: readonly string[];
}

export type DashboardMode =
	| { readonly type: "rows" }
	| { readonly type: "chooser"; readonly workspaceRef: string; readonly selectedIndex: number }
	| { readonly type: "unavailable"; readonly reason: string };

export interface DashboardState {
	readonly selectedWorkspaceRef?: string | undefined;
	readonly mode: DashboardMode;
	readonly statusMessage?: string | undefined;
	readonly lastRefreshAt?: number | undefined;
}

export type DashboardAction =
	| { readonly type: "move-selection"; readonly delta: number }
	| { readonly type: "refresh"; readonly model: DashboardModel }
	| { readonly type: "show-chooser"; readonly workspaceRef: string }
	| { readonly type: "move-chooser"; readonly delta: number }
	| { readonly type: "cancel-chooser" }
	| { readonly type: "set-status"; readonly message: string }
	| { readonly type: "set-unavailable"; readonly reason: string };

export interface DashboardActivationTarget {
	readonly windowRef: string;
	readonly workspaceRef: string;
	readonly surfaceRef: string;
}

export type DashboardActivationPlan =
	| { readonly type: "focus-surface"; readonly target: DashboardActivationTarget }
	| { readonly type: "choose-surface"; readonly workspaceRef: string; readonly choices: readonly DashboardSurfaceChoice[] }
	| { readonly type: "unavailable"; readonly reason: string };

export interface DashboardSurfaceChoice {
	readonly target: DashboardActivationTarget;
	readonly title: string;
	readonly type: string;
	readonly tty?: string | undefined;
	readonly selected: boolean;
	readonly focused: boolean;
	readonly here: boolean;
}

export function createInitialDashboardState(model: DashboardModel): DashboardState {
	const selectedWorkspaceRef = model.windows[0]?.workspaces[0]?.ref;
	return { selectedWorkspaceRef, mode: { type: "rows" } };
}

export function reduceDashboardState(model: DashboardModel, state: DashboardState, action: DashboardAction): DashboardState {
	switch (action.type) {
		case "move-selection":
			return state.mode.type === "rows" ? moveSelection(model, state, action.delta) : state;
		case "refresh":
			return refreshDashboardState(model, state, action.model);
		case "show-chooser":
			return { ...state, mode: { type: "chooser", workspaceRef: action.workspaceRef, selectedIndex: 0 } };
		case "move-chooser":
			return state.mode.type === "chooser" ? { ...state, mode: { ...state.mode, selectedIndex: wrapIndex(state.mode.selectedIndex + action.delta, surfacesForWorkspace(model, state.mode.workspaceRef).length) } } : state;
		case "cancel-chooser":
			return { ...state, mode: { type: "rows" }, statusMessage: "Cancelled chooser." };
		case "set-status":
			return { ...state, statusMessage: action.message };
		case "set-unavailable":
			return { ...state, mode: { type: "unavailable", reason: action.reason }, statusMessage: action.reason };
	}
}

export function planDashboardActivation(model: DashboardModel, state: DashboardState): DashboardActivationPlan {
	const workspace = selectedWorkspace(model, state);
	if (workspace === undefined) return { type: "unavailable", reason: "No workspace is available in the current cmux window." };
	const surfaces = workspace.surfaces;
	const selected = surfaces.filter((surface) => surface.selected || surface.selectedInPane);
	if (selected.length === 1) return { type: "focus-surface", target: surfaceTarget(workspace, selected[0]!) };
	const focused = surfaces.filter((surface) => surface.focused);
	if (focused.length === 1) return { type: "focus-surface", target: surfaceTarget(workspace, focused[0]!) };
	const active = surfaces.filter((surface) => surface.active);
	if (active.length === 1) return { type: "focus-surface", target: surfaceTarget(workspace, active[0]!) };
	const here = surfaces.filter((surface) => surface.here);
	if (here.length === 1) return { type: "focus-surface", target: surfaceTarget(workspace, here[0]!) };
	if (surfaces.length === 1) return { type: "focus-surface", target: surfaceTarget(workspace, surfaces[0]!) };
	return { type: "choose-surface", workspaceRef: workspace.ref, choices: surfaces.map((surface) => ({ target: surfaceTarget(workspace, surface), title: surface.title, type: surface.type, tty: surface.tty, selected: surface.selected, focused: surface.focused, here: surface.here })) };
}

const DASHBOARD_KEYS: readonly (readonly [string, string])[] = [
	["↑/k", "previous"],
	["↓/j", "next"],
	["Enter", "focus"],
	["r", "refresh"],
	["Tab", "switch"],
	["q", "quit"],
];

export function renderDashboardFrame(model: DashboardModel, state: DashboardState): StyledText {
	const window = selectedWindow(model);
	const rows = window?.workspaces ?? [];
	const selected = selectedWorkspace(model, state);
	const lines: TextChunk[][] = [];
	lines.push(renderDashboardHero(model, window, rows));
	if (model.diagnostics.length > 0) lines.push(...renderDiagnostics(model.diagnostics));
	lines.push([]);
	lines.push([bold(fg(PALETTE.accent)("Workspaces"))]);
	lines.push(formatWorkspaceHeader(rows));
	lines.push(formatWorkspaceRule(rows));
	if (rows.length === 0) {
		lines.push([dim(fg(PALETTE.muted)("  No cmux workspaces are visible in the current window."))]);
	} else {
		for (const workspace of rows) lines.push(formatWorkspaceRow(workspace, rows, workspace.ref === state.selectedWorkspaceRef));
	}
	lines.push([]);
	lines.push(...renderSelectedWorkspaceDetails(selected));
	if (state.statusMessage !== undefined) {
		lines.push([]);
		lines.push([bold(fg(PALETTE.yellow)("Status  ")), plain(state.statusMessage)]);
	}
	lines.push([]);
	lines.push(renderKeysFooter());
	return joinLines(lines);
}

function renderKeysFooter(): TextChunk[] {
	const chunks: TextChunk[] = [dim(fg(PALETTE.muted)("Keys: "))];
	DASHBOARD_KEYS.forEach(([key, label], index) => {
		if (index > 0) chunks.push(dim(fg(PALETTE.muted)("  ")));
		chunks.push(bold(fg(PALETTE.subtle)(key)));
		chunks.push(dim(fg(PALETTE.muted)(` ${label}`)));
	});
	return chunks;
}

function renderDashboardHero(model: DashboardModel, window: DashboardWindow | undefined, rows: readonly DashboardWorkspace[]): TextChunk[] {
	const surfaceCount = rows.reduce((count, workspace) => count + workspace.surfaces.length, 0);
	const branchCount = new Set(rows.flatMap((workspace) => workspace.surfaces.flatMap((surface) => surface.branch === undefined ? [] : [surface.branch]))).size;
	const windowLabel = window === undefined ? "no window" : `window ${window.ref}${window.key === undefined ? "" : ` · key ${window.key}`}`;
	return [
		bold(fg(PALETTE.accent)(model.title)),
		dim(fg(PALETTE.subtle)(` · ${windowLabel} · ${rows.length} workspaces · ${surfaceCount} surfaces · ${branchCount} branches`)),
	];
}

function renderDiagnostics(diagnostics: readonly string[]): TextChunk[][] {
	return [[], [bold(fg(PALETTE.red)("Diagnostics"))], ...diagnostics.map((diagnostic): TextChunk[] => [fg(PALETTE.red)(`  ! ${diagnostic}`)])];
}

function formatWorkspaceHeader(rows: readonly DashboardWorkspace[]): TextChunk[] {
	const widths = dashboardTableWidths(rows);
	const text = `  ${"".padEnd(2)} ${"Workspace".padEnd(widths.workspace)}  ${"Status".padEnd(widths.state)}  ${"Cmux".padEnd(widths.cmux)}  Branch`;
	return [bold(fg(PALETTE.subtle)(text))];
}

function formatWorkspaceRule(rows: readonly DashboardWorkspace[]): TextChunk[] {
	const widths = dashboardTableWidths(rows);
	const text = `  ${"─".repeat(2)} ${"─".repeat(widths.workspace)}  ${"─".repeat(widths.state)}  ${"─".repeat(widths.cmux)}  ${"─".repeat(28)}`;
	return [dim(fg(PALETTE.muted)(text))];
}

function formatWorkspaceRow(workspace: DashboardWorkspace, rows: readonly DashboardWorkspace[], selected: boolean): TextChunk[] {
	const widths = dashboardTableWidths(rows);
	const stateText = formatWorkspaceState(workspace);
	const cmuxText = formatCmuxSummary(workspace);
	const chunks: TextChunk[] = [
		plain("  "),
		bold(fg(PALETTE.accent)(selected ? "▶" : " ")),
		plain("  "),
		selected ? bold(fg(PALETTE.text)(workspace.title)) : fg(PALETTE.text)(workspace.title),
		pad(widths.workspace, workspace.title.length),
		plain("  "),
		...formatWorkspaceStateChunks(workspace),
		pad(widths.state, stateText.length),
		plain("  "),
		...formatCmuxSummaryChunks(cmuxText),
		pad(widths.cmux, cmuxText.length),
		plain("  "),
		formatBranchSummaryChunk(formatBranchSummary(workspace)),
	];
	return selected ? highlightRow(chunks) : chunks;
}

function dashboardTableWidths(rows: readonly DashboardWorkspace[]): { readonly workspace: number; readonly state: number; readonly cmux: number } {
	return {
		workspace: Math.max("Workspace".length, ...rows.map((workspace) => workspace.title.length)),
		state: Math.max("Status".length, ...rows.map((workspace) => formatWorkspaceState(workspace).length)),
		cmux: Math.max("Cmux".length, ...rows.map((workspace) => formatCmuxSummary(workspace).length)),
	};
}

function bucketLabel(bucket: DashboardStatusBucket): string {
	switch (bucket) {
		case "here":
			return "here";
		case "active":
			return "active";
		case "selected":
			return "selected";
		case "idle/open":
			return "idle";
		case "multi-surface":
			return "multi";
		case "unmatched-branch":
			return "branch?";
		case "diagnostic":
			return "diag";
	}
}

function bucketColor(bucket: DashboardStatusBucket): string {
	switch (bucket) {
		case "here":
			return PALETTE.accent;
		case "active":
			return PALETTE.green;
		case "selected":
			return PALETTE.mauve;
		case "idle/open":
			return PALETTE.muted;
		case "multi-surface":
			return PALETTE.yellow;
		case "unmatched-branch":
			return PALETTE.peach;
		case "diagnostic":
			return PALETTE.red;
	}
}

function formatWorkspaceState(workspace: DashboardWorkspace): string {
	return workspace.statusBuckets.map((bucket) => bucketLabel(bucket)).join(" · ") || "idle";
}

function formatWorkspaceStateChunks(workspace: DashboardWorkspace): TextChunk[] {
	if (workspace.statusBuckets.length === 0) return [dim(fg(PALETTE.muted)("idle"))];
	const chunks: TextChunk[] = [];
	workspace.statusBuckets.forEach((bucket, index) => {
		if (index > 0) chunks.push(dim(fg(PALETTE.muted)(" · ")));
		chunks.push(fg(bucketColor(bucket))(bucketLabel(bucket)));
	});
	return chunks;
}

function formatCmuxSummary(workspace: DashboardWorkspace): string {
	const noun = workspace.surfaces.length === 1 ? "surface" : "surfaces";
	return `${workspace.surfaces.length} ${noun}`;
}

function formatCmuxSummaryChunks(text: string): TextChunk[] {
	const separatorIndex = text.indexOf(" ");
	if (separatorIndex === -1) return [fg(PALETTE.accent)(text)];
	return [fg(PALETTE.accent)(text.slice(0, separatorIndex)), dim(fg(PALETTE.muted)(text.slice(separatorIndex)))];
}

function formatBranchSummary(workspace: DashboardWorkspace): string {
	if (workspace.branchEvidence.length > 0) return workspace.branchEvidence.join(", ");
	const branches = workspace.surfaces.flatMap((surface) => surface.branch === undefined ? [] : [surface.branch]);
	if (branches.length > 0) return branches.join(", ");
	return "—";
}

function formatBranchSummaryChunk(text: string): TextChunk {
	return text === "—" ? dim(fg(PALETTE.muted)(text)) : fg(PALETTE.subtle)(text);
}

function renderSelectedWorkspaceDetails(workspace: DashboardWorkspace | undefined): TextChunk[][] {
	if (workspace === undefined) return [[bold(fg(PALETTE.accent)("Selected workspace"))], [dim(fg(PALETTE.muted)("  none"))]];
	const lines: TextChunk[][] = [[
		bold(fg(PALETTE.accent)("Selected workspace")),
		plain("  "),
		fg(PALETTE.text)(workspace.title),
		dim(fg(PALETTE.muted)(` · ${workspace.ref}`)),
	]];
	if (workspace.description !== undefined && workspace.description.trim() !== "") lines.push([dim(fg(PALETTE.subtle)(`  ${workspace.description}`))]);
	if (workspace.surfaces.length === 0) {
		lines.push([dim(fg(PALETTE.muted)("  No surfaces."))]);
		return lines;
	}
	const widths = surfaceTableWidths(workspace.surfaces);
	lines.push([bold(fg(PALETTE.subtle)(`  ${"Surface".padEnd(widths.title)}  ${"Type".padEnd(widths.type)}  ${"TTY".padEnd(widths.tty)}  State`))]);
	lines.push([dim(fg(PALETTE.muted)(`  ${"─".repeat(widths.title)}  ${"─".repeat(widths.type)}  ${"─".repeat(widths.tty)}  ${"─".repeat(20)}`))]);
	for (const surface of workspace.surfaces) {
		const tty = surface.tty ?? "—";
		lines.push([
			plain("  "),
			fg(PALETTE.text)(surface.title),
			pad(widths.title, surface.title.length),
			plain("  "),
			dim(fg(PALETTE.subtle)(surface.type)),
			pad(widths.type, surface.type.length),
			plain("  "),
			dim(fg(PALETTE.muted)(tty)),
			pad(widths.tty, tty.length),
			plain("  "),
			...formatSurfaceStateChunks(surface),
		]);
	}
	return lines;
}

function surfaceTableWidths(surfaces: readonly DashboardSurface[]): { readonly title: number; readonly type: number; readonly tty: number } {
	return {
		title: Math.max("Surface".length, ...surfaces.map((surface) => surface.title.length)),
		type: Math.max("Type".length, ...surfaces.map((surface) => surface.type.length)),
		tty: Math.max("TTY".length, ...surfaces.map((surface) => (surface.tty ?? "—").length)),
	};
}

function surfaceStateParts(surface: DashboardSurface): readonly (readonly [string, string])[] {
	const parts: (readonly [string, string])[] = [];
	if (surface.here) parts.push(["here", PALETTE.accent]);
	if (surface.focused) parts.push(["focused", PALETTE.accent]);
	if (surface.selected || surface.selectedInPane) parts.push(["selected", PALETTE.mauve]);
	if (surface.active) parts.push(["active", PALETTE.green]);
	return parts;
}

function formatSurfaceStateChunks(surface: DashboardSurface): TextChunk[] {
	const parts = surfaceStateParts(surface);
	if (parts.length === 0) return [dim(fg(PALETTE.muted)("idle"))];
	const chunks: TextChunk[] = [];
	parts.forEach(([label, color], index) => {
		if (index > 0) chunks.push(dim(fg(PALETTE.muted)(" · ")));
		chunks.push(fg(color)(label));
	});
	return chunks;
}

function refreshDashboardState(previousModel: DashboardModel, state: DashboardState, nextModel: DashboardModel): DashboardState {
	const preferred = state.selectedWorkspaceRef ?? previousModel.windows[0]?.workspaces[0]?.ref;
	const nextWorkspace = findWorkspace(nextModel, preferred);
	if (nextWorkspace !== undefined) return { ...state, selectedWorkspaceRef: nextWorkspace.ref, lastRefreshAt: Date.now() };
	const fallback = nextModel.windows[0]?.workspaces[0]?.ref;
	return { ...state, selectedWorkspaceRef: fallback, lastRefreshAt: Date.now() };
}

function moveSelection(model: DashboardModel, state: DashboardState, delta: number): DashboardState {
	const window = selectedWindow(model);
	const rows = window?.workspaces ?? [];
	if (rows.length === 0) return state;
	const currentIndex = Math.max(0, rows.findIndex((workspace) => workspace.ref === state.selectedWorkspaceRef));
	const nextWorkspace = rows[wrapIndex(currentIndex + delta, rows.length)];
	return nextWorkspace === undefined ? state : { ...state, selectedWorkspaceRef: nextWorkspace.ref };
}

function selectedWindow(model: DashboardModel): DashboardWindow | undefined {
	return model.windows.find((window) => window.ref === model.selectedWindowRef) ?? model.windows[0];
}

function selectedWorkspace(model: DashboardModel, state: DashboardState): DashboardWorkspace | undefined {
	const window = selectedWindow(model);
	return window?.workspaces.find((workspace) => workspace.ref === state.selectedWorkspaceRef) ?? window?.workspaces[0];
}

function findWorkspace(model: DashboardModel, ref: string | undefined): DashboardWorkspace | undefined {
	if (ref === undefined) return undefined;
	for (const window of model.windows) {
		const workspace = window.workspaces.find((item) => item.ref === ref);
		if (workspace !== undefined) return workspace;
	}
	return undefined;
}

function surfacesForWorkspace(model: DashboardModel, workspaceRef: string): readonly DashboardSurface[] {
	for (const window of model.windows) {
		const workspace = window.workspaces.find((item) => item.ref === workspaceRef);
		if (workspace !== undefined) return workspace.surfaces;
	}
	return [];
}

function surfaceTarget(workspace: DashboardWorkspace, surface: DashboardSurface): DashboardActivationTarget {
	return { windowRef: surface.windowRef, workspaceRef: workspace.ref, surfaceRef: surface.ref };
}

function wrapIndex(index: number, size: number): number {
	return size <= 0 ? 0 : ((index % size) + size) % size;
}

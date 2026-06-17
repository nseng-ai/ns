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

export function renderDashboardFrame(model: DashboardModel, state: DashboardState): string {
	const window = selectedWindow(model);
	const rows = window?.workspaces ?? [];
	const selected = selectedWorkspace(model, state);
	const lines: string[] = [];
	const titleParts = [model.title, `window=${window?.ref ?? "none"}`];
	if (window?.key !== undefined) titleParts.push(`key=${window.key}`);
	lines.push(titleParts.join("  "));
	if (model.diagnostics.length > 0) {
		lines.push("Diagnostics:");
		for (const diagnostic of model.diagnostics) lines.push(`- ${diagnostic}`);
	}
	lines.push("");
	lines.push(formatWorkspaceHeader(rows));
	lines.push(formatWorkspaceRule(rows));
	if (rows.length === 0) {
		lines.push("  No cmux workspaces are visible in the current window.");
	} else {
		for (const workspace of rows) {
			const cursor = workspace.ref === state.selectedWorkspaceRef ? "› " : "  ";
			lines.push(`${cursor}${formatWorkspaceRow(workspace, rows)}`);
		}
	}
	lines.push("");
	lines.push(...renderSelectedWorkspaceDetails(selected));
	if (state.statusMessage !== undefined) {
		lines.push("");
		lines.push(`State: ${state.statusMessage}`);
	}
	lines.push("");
	lines.push("Keys: ↑/k previous  ↓/j next  Enter focus  r refresh  Tab switch  q quit");
	return lines.join("\n");
}

function formatWorkspaceHeader(rows: readonly DashboardWorkspace[]): string {
	const widths = dashboardTableWidths(rows);
	return `  ${"WORKSPACE".padEnd(widths.workspace)}  ${"STATE".padEnd(widths.state)}  ${"CMUX".padEnd(widths.cmux)}  BRANCH`;
}

function formatWorkspaceRule(rows: readonly DashboardWorkspace[]): string {
	const widths = dashboardTableWidths(rows);
	return `  ${"─".repeat(widths.workspace)}  ${"─".repeat(widths.state)}  ${"─".repeat(widths.cmux)}  ${"─".repeat(24)}`;
}

function formatWorkspaceRow(workspace: DashboardWorkspace, rows: readonly DashboardWorkspace[]): string {
	const widths = dashboardTableWidths(rows);
	return `${workspace.title.padEnd(widths.workspace)}  ${formatWorkspaceState(workspace).padEnd(widths.state)}  ${formatCmuxSummary(workspace).padEnd(widths.cmux)}  ${formatBranchSummary(workspace)}`;
}

function dashboardTableWidths(rows: readonly DashboardWorkspace[]): { readonly workspace: number; readonly state: number; readonly cmux: number } {
	return {
		workspace: Math.max("WORKSPACE".length, ...rows.map((workspace) => workspace.title.length)),
		state: Math.max("STATE".length, ...rows.map((workspace) => formatWorkspaceState(workspace).length)),
		cmux: Math.max("CMUX".length, ...rows.map((workspace) => formatCmuxSummary(workspace).length)),
	};
}

function formatWorkspaceState(workspace: DashboardWorkspace): string {
	const labels = workspace.statusBuckets.map((bucket) => {
		switch (bucket) {
			case "idle/open":
				return "idle";
			case "multi-surface":
				return "multi";
			case "unmatched-branch":
				return "branch?";
			default:
				return bucket;
		}
	});
	return labels.join(", ") || "idle";
}

function formatCmuxSummary(workspace: DashboardWorkspace): string {
	const noun = workspace.surfaces.length === 1 ? "surface" : "surfaces";
	return `${workspace.surfaces.length} ${noun}`;
}

function formatBranchSummary(workspace: DashboardWorkspace): string {
	if (workspace.branchEvidence.length > 0) return workspace.branchEvidence.join(", ");
	const branches = workspace.surfaces.flatMap((surface) => surface.branch === undefined ? [] : [surface.branch]);
	if (branches.length > 0) return branches.join(", ");
	return "—";
}

function renderSelectedWorkspaceDetails(workspace: DashboardWorkspace | undefined): readonly string[] {
	if (workspace === undefined) return ["Selected: none"];
	const lines = [`Selected: ${workspace.title}  ${workspace.ref}`];
	if (workspace.description !== undefined && workspace.description.trim() !== "") lines.push(`Description: ${workspace.description}`);
	if (workspace.surfaces.length === 0) {
		lines.push("  No surfaces.");
		return lines;
	}
	lines.push("  SURFACE                         TYPE       TTY       STATE");
	lines.push("  ─────────────────────────────── ────────── ───────── ─────────────────");
	for (const surface of workspace.surfaces) {
		lines.push(`  ${surface.title.padEnd(31)} ${surface.type.padEnd(10)} ${(surface.tty ?? "—").padEnd(9)} ${formatSurfaceState(surface)}`);
	}
	return lines;
}

function formatSurfaceState(surface: DashboardSurface): string {
	const labels = [];
	if (surface.here) labels.push("here");
	if (surface.focused) labels.push("focused");
	if (surface.selected || surface.selectedInPane) labels.push("selected");
	if (surface.active) labels.push("active");
	return labels.join(", ") || "idle";
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

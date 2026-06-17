import type { StackMapBranchNode, StackMapModel } from "./stack-map.ts";
import { isRecord, optionalStringField, stringField } from "./json-fields.ts";
import type { DashboardModel, DashboardPane, DashboardSurface, DashboardWindow, DashboardWorkspace } from "./dashboard.ts";

export function createDashboardModelFromCmuxTree(raw: unknown, stackMapModel: StackMapModel, diagnostics: readonly string[] = []): DashboardModel {
	if (!isRecord(raw)) return { title: "sdlcc dashboard", windows: [], diagnostics: ["cmux tree was not an object.", ...diagnostics] };
	const windows = Array.isArray(raw.windows) ? raw.windows.flatMap((window) => parseWindow(window, stackMapModel)) : [];
	const selectedWindowRef = selectWindowRef(windows);
	return { title: "sdlcc dashboard", windows, selectedWindowRef, diagnostics };
}

function parseWindow(raw: unknown, stackMapModel: StackMapModel): readonly DashboardWindow[] {
	if (!isRecord(raw)) return [];
	const ref = stringField(raw, "ref");
	const index = numberField(raw, "index");
	const workspacesRaw = raw.workspaces;
	if (ref === undefined || index === undefined || !Array.isArray(workspacesRaw)) return [];
	const workspaces = workspacesRaw.flatMap((workspace) => parseWorkspace(ref, workspace, stackMapModel));
	return [{ ref, key: optionalStringField(raw, "key"), index, active: booleanField(raw, "active"), current: booleanField(raw, "current"), visible: booleanField(raw, "visible"), selectedWorkspaceRef: optionalStringField(raw, "selected_workspace_ref"), workspaces, diagnostic: undefined }];
}

function parseWorkspace(windowRef: string, raw: unknown, stackMapModel: StackMapModel): readonly DashboardWorkspace[] {
	if (!isRecord(raw)) return [];
	const ref = stringField(raw, "ref");
	const title = stringField(raw, "title");
	const index = numberField(raw, "index");
	const panesRaw = raw.panes;
	if (ref === undefined || title === undefined || index === undefined || !Array.isArray(panesRaw)) return [];
	const panes = panesRaw.flatMap((pane) => parsePane(windowRef, ref, pane));
	const surfaces = panes.flatMap((pane) => pane.surfaces);
	const statusBuckets = buildStatusBuckets(raw, panes, surfaces);
	return [{ ref, title, description: optionalStringField(raw, "description"), index, active: booleanField(raw, "active"), selected: booleanField(raw, "selected"), pinned: booleanField(raw, "pinned"), panes, surfaces, statusBuckets, branchEvidence: branchEvidenceForWorkspace(ref, surfaces, stackMapModel), diagnostics: [], matchSummary: undefined }];
}

function parsePane(windowRef: string, workspaceRef: string, raw: unknown): readonly DashboardPane[] {
	if (!isRecord(raw)) return [];
	const ref = stringField(raw, "ref");
	const surfacesRaw = raw.surfaces;
	if (ref === undefined || !Array.isArray(surfacesRaw)) return [];
	const surfaces = surfacesRaw.flatMap((surface) => parseSurface(windowRef, workspaceRef, ref, surface));
	return [{ ref, active: booleanField(raw, "active"), focused: booleanField(raw, "focused"), selectedSurfaceRef: optionalStringField(raw, "selected_surface_ref"), surfaces }];
}

function parseSurface(windowRef: string, workspaceRef: string, paneRef: string, raw: unknown): readonly DashboardSurface[] {
	if (!isRecord(raw)) return [];
	const ref = stringField(raw, "ref");
	const title = stringField(raw, "title");
	const type = optionalStringField(raw, "type") ?? "unknown";
	if (ref === undefined || title === undefined) return [];
	return [{ ref, title, type, tty: optionalStringField(raw, "tty"), active: booleanField(raw, "active"), focused: booleanField(raw, "focused"), here: booleanField(raw, "here"), selected: booleanField(raw, "selected"), selectedInPane: booleanField(raw, "selected_in_pane"), branch: optionalStringField(raw, "branch"), worktreePath: optionalStringField(raw, "worktree_path"), workspaceRef, windowRef, paneRef }];
}

function buildStatusBuckets(rawWorkspace: Record<string, unknown>, panes: readonly DashboardPane[], surfaces: readonly DashboardSurface[]): DashboardWorkspace["statusBuckets"] {
	const buckets: DashboardWorkspace["statusBuckets"] = [];
	if (surfaces.some((surface) => surface.here)) buckets.push("here");
	if (rawWorkspace.active === true || panes.some((pane) => pane.active || pane.focused) || surfaces.some((surface) => surface.active || surface.focused)) buckets.push("active");
	if (rawWorkspace.selected === true || surfaces.some((surface) => surface.selected || surface.selectedInPane)) buckets.push("selected");
	if (surfaces.length > 1) buckets.push("multi-surface");
	if (surfaces.some((surface) => surface.branch !== undefined || surface.worktreePath !== undefined)) buckets.push("unmatched-branch");
	if (buckets.length === 0) buckets.push("idle/open");
	return buckets;
}

function branchEvidenceForWorkspace(workspaceRef: string, surfaces: readonly DashboardSurface[], stackMapModel: StackMapModel): readonly string[] {
	const evidence = new Set<string>();
	const branchNodes = collectBranchNodes(stackMapModel.trunk);
	for (const node of branchNodes) {
		for (const target of node.cmuxTabs ?? []) {
			if (target.workspaceRef === workspaceRef) {
				evidence.add(target.match.type === "explicit-branch" ? target.match.branch : target.match.type === "slot-worktree" ? target.match.slotName : target.match.worktreePath);
			}
		}
	}
	for (const surface of surfaces) {
		if (surface.branch !== undefined) evidence.add(surface.branch);
	}
	return [...evidence];
}

function collectBranchNodes(root: StackMapBranchNode): readonly StackMapBranchNode[] {
	return [root, ...(root.children?.flatMap(collectBranchNodes) ?? [])];
}

function selectWindowRef(windows: readonly DashboardWindow[]): string | undefined {
	const current = windows.filter((window) => window.current);
	if (current.length === 1) return current[0]?.ref;
	const active = windows.filter((window) => window.active);
	if (active.length === 1) return active[0]?.ref;
	const visible = windows.filter((window) => window.visible);
	if (visible.length === 1) return visible[0]?.ref;
	return windows[0]?.ref;
}

function booleanField(record: Record<string, unknown>, key: string): boolean {
	return record[key] === true;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	return typeof value === "number" ? value : undefined;
}

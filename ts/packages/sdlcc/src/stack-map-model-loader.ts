import {
	matchCmuxTabsToBranches,
	type StackMapBranchNode,
	type StackMapCmuxSurfaceType,
	type StackMapModel,
	type StackMapParsedCmuxTab,
	type StackMapSlotAssignment,
	type StackMapSlotStatus,
} from "./stack-map.ts";
import { runRealCommand, type StackMapCommandOptions, type StackMapCommandOutput, type StackMapCommandRunner } from "./command-runner.ts";
import { booleanField, isRecord, optionalEntry, optionalStringField, stringArrayField, stringField } from "./json-fields.ts";

export type { StackMapCommandOptions, StackMapCommandOutput, StackMapCommandRunner } from "./command-runner.ts";

const COMMAND_TIMEOUT_MS = 10_000;

export interface LoadStackMapModelOptions {
	readonly cwd?: string | undefined;
	readonly runCommand?: StackMapCommandRunner | undefined;
}

interface StackMapGraphData {
	readonly branches: readonly StackMapGraphBranch[];
	readonly trunk: string;
	readonly current: string;
	readonly edges: readonly StackMapGraphEdge[];
	readonly slots: readonly StackMapGraphSlot[];
	readonly warnings: readonly string[];
}

interface StackMapGraphBranch {
	readonly name: string;
	readonly parent: string | undefined;
	readonly children: readonly string[];
	readonly needsRestack: boolean;
}

interface StackMapGraphEdge {
	readonly parent: string;
	readonly child: string;
}

interface StackMapGraphSlot extends StackMapSlotAssignment {}

export async function loadStackMapModel(options: LoadStackMapModelOptions = {}): Promise<StackMapModel> {
	const cwd = options.cwd ?? process.cwd();
	const runCommand = options.runCommand ?? runRealCommand;
	const [graphResult, cmuxResult] = await Promise.all([
		loadStackMapGraph(runCommand, cwd),
		loadCmuxTabs(runCommand, cwd),
	]);
	if (graphResult.type === "failure") {
		return buildUnavailableStackMapModel([
			graphResult.message,
			cmuxResult.type === "failure" ? cmuxResult.message : undefined,
		].filter((message): message is string => message !== undefined));
	}

	return buildStackMapModelFromGraph(graphResult.data, {
		cmuxTabs: cmuxResult.type === "success" ? cmuxResult.tabs : [],
		diagnostics: cmuxResult.type === "failure" ? [cmuxResult.message] : [],
	});
}

export function buildStackMapModelFromGraph(
	graph: StackMapGraphData,
	options: { readonly cmuxTabs?: readonly StackMapParsedCmuxTab[] | undefined; readonly diagnostics?: readonly string[] | undefined } = {},
): StackMapModel {
	const slotsByBranch = slotsByBranchName(graph.slots);
	const branchesByName = new Map(graph.branches.map((branch) => [branch.name, branch]));
	const childrenByParent = childrenByParentName(graph.branches);
	const root = buildGraphBranchTree(graph.trunk, {
		branchesByName,
		childrenByParent,
		current: graph.current,
		slotsByBranch,
		trunk: graph.trunk,
		visited: new Set(),
	});
	const modeled = collectBranchNames(root);
	const missing = graph.branches.filter((branch) => !modeled.has(branch.name));
	const trunk = missing.length === 0
		? root
		: {
			...root,
			children: [...(root.children ?? []), ...missing.map((branch) => leafBranchNode(branch, graph, slotsByBranch))],
		};
	const model: StackMapModel = {
		title: "sdlcc stack map",
		diagnostics: [
			"Loaded from `slot gt exec stack-map-branches --format json`.",
			...graph.warnings,
			...(options.diagnostics ?? []),
		].filter((diagnostic) => diagnostic.length > 0),
		currentBranch: graph.current,
		trunk,
	};
	const cmuxTabs = options.cmuxTabs ?? [];
	if (cmuxTabs.length === 0) return model;
	return {
		...model,
		trunk: matchCmuxTabsToBranches({ root: model.trunk, slots: graph.slots, tabs: cmuxTabs }),
	};
}

export function parseCmuxTreeTabs(stdout: string): { type: "success"; tabs: readonly StackMapParsedCmuxTab[] } | { type: "failure"; message: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout.trim() || "{}");
	} catch (error) {
		return { type: "failure", message: `cmux tree JSON was invalid: ${error instanceof Error ? error.message : String(error)}` };
	}
	return parseCmuxTreeData(parsed);
}

async function loadStackMapGraph(runCommand: StackMapCommandRunner, cwd: string): Promise<{ type: "success"; data: StackMapGraphData } | { type: "failure"; message: string }> {
	const result = await runCommand("slot", ["gt", "exec", "stack-map-branches", "--format", "json"], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
	const parsed = parseMachineEnvelopeData(result.stdout, "slot gt exec stack-map-branches JSON");
	if (parsed.type === "failure") {
		return { type: "failure", message: `${parsed.message}${result.stderr.trim() ? ` ${result.stderr.trim()}` : ""}` };
	}
	const data = parseStackMapGraphData(parsed.data);
	if (data.type === "failure") return data;
	return { type: "success", data: data.data };
}

async function loadCmuxTabs(runCommand: StackMapCommandRunner, cwd: string): Promise<{ type: "success"; tabs: readonly StackMapParsedCmuxTab[] } | { type: "failure"; message: string }> {
	const result = await runCommand("cmux", ["tree", "--json", "--all"], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
	if (result.code !== 0) return { type: "failure", message: `Could not load cmux tab inventory: ${result.stderr.trim() || result.stdout.trim() || `cmux tree exited ${result.code}`}` };
	const parsed = parseCmuxTreeTabs(result.stdout);
	if (parsed.type === "failure") return { type: "failure", message: `Could not load cmux tab inventory: ${parsed.message}` };
	return parsed;
}

function parseMachineEnvelopeData(stdout: string, label: string): { type: "success"; data: unknown } | { type: "failure"; message: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		return { type: "failure", message: `${label} was not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
	}
	if (!isRecord(parsed)) return { type: "failure", message: `${label} was not a JSON object.` };
	const exitCode = parsed.exit_code;
	if (exitCode !== 0) return { type: "failure", message: `${label} reported failure exit_code ${String(exitCode)}: ${stringField(parsed, "message") ?? "no message"}` };
	if (!("data" in parsed)) return { type: "failure", message: `${label} did not include data.` };
	return { type: "success", data: parsed.data };
}

function parseStackMapGraphData(data: unknown): { type: "success"; data: StackMapGraphData } | { type: "failure"; message: string } {
	if (!isRecord(data)) return { type: "failure", message: "slot gt stack-map data was not an object." };
	const branches = branchArrayField(data, "branches");
	const trunk = stringField(data, "trunk");
	const current = stringField(data, "current");
	const edges = edgeArrayField(data, "edges");
	const slots = slotArrayField(data, "slots");
	const warnings = stringArrayField(data, "warnings");
	if (branches === undefined || trunk === undefined || current === undefined || edges === undefined || slots === undefined || warnings === undefined) {
		return { type: "failure", message: "slot gt stack-map data was missing branches/trunk/current/edges/slots/warnings." };
	}
	return { type: "success", data: { branches, trunk, current, edges, slots, warnings } };
}

function branchArrayField(record: Record<string, unknown>, key: string): readonly StackMapGraphBranch[] | undefined {
	const value = record[key];
	if (!Array.isArray(value)) return undefined;
	const branches: StackMapGraphBranch[] = [];
	for (const item of value) {
		if (!isRecord(item)) return undefined;
		const name = stringField(item, "name");
		const parent = optionalStringField(item, "parent");
		const children = stringArrayField(item, "children");
		const needsRestack = booleanField(item, "needs_restack");
		if (name === undefined || children === undefined || needsRestack === undefined) return undefined;
		branches.push({ name, parent, children, needsRestack });
	}
	return branches;
}

function edgeArrayField(record: Record<string, unknown>, key: string): readonly StackMapGraphEdge[] | undefined {
	const value = record[key];
	if (!Array.isArray(value)) return undefined;
	const edges: StackMapGraphEdge[] = [];
	for (const item of value) {
		if (!isRecord(item)) return undefined;
		const parent = stringField(item, "parent");
		const child = stringField(item, "child");
		if (parent === undefined || child === undefined) return undefined;
		edges.push({ parent, child });
	}
	return edges;
}

function slotArrayField(record: Record<string, unknown>, key: string): readonly StackMapGraphSlot[] | undefined {
	const value = record[key];
	if (!Array.isArray(value)) return undefined;
	const slots: StackMapGraphSlot[] = [];
	for (const item of value) {
		if (!isRecord(item)) return undefined;
		const slotName = stringField(item, "slot_name");
		const branch = stringField(item, "branch");
		const worktreePath = optionalStringField(item, "worktree_path");
		if (slotName === undefined || branch === undefined) return undefined;
		slots.push({ slotName, branch, ...optionalEntry("worktreePath", worktreePath), status: normalizeSlotStatus(optionalStringField(item, "status")) });
	}
	return slots;
}

function parseCmuxTreeData(data: unknown): { type: "success"; tabs: readonly StackMapParsedCmuxTab[] } | { type: "failure"; message: string } {
	if (!isRecord(data)) return { type: "failure", message: "cmux tree was not a JSON object." };
	const windows = data.windows;
	if (!Array.isArray(windows)) return { type: "failure", message: "cmux tree was missing windows." };

	const tabs: StackMapParsedCmuxTab[] = [];
	for (const window of windows) {
		if (!isRecord(window)) continue;
		const windowRef = stringField(window, "ref");
		const workspaces = window.workspaces;
		if (windowRef === undefined || !Array.isArray(workspaces)) continue;
		for (const workspace of workspaces) {
			if (!isRecord(workspace)) continue;
			const workspaceRef = stringField(workspace, "ref");
			const workspaceTitle = stringField(workspace, "title");
			const panes = workspace.panes;
			if (workspaceRef === undefined || workspaceTitle === undefined || !Array.isArray(panes)) continue;
			for (const pane of panes) {
				if (!isRecord(pane)) continue;
				const paneRef = stringField(pane, "ref");
				const surfaces = pane.surfaces;
				if (paneRef === undefined || !Array.isArray(surfaces)) continue;
				for (const surface of surfaces) {
					const tab = parseCmuxSurfaceTab({ windowRef, workspaceRef, workspaceTitle, workspace, paneRef, pane, surface });
					if (tab !== undefined) tabs.push(tab);
				}
			}
		}
	}
	return { type: "success", tabs };
}

function parseCmuxSurfaceTab(options: {
	readonly windowRef: string;
	readonly workspaceRef: string;
	readonly workspaceTitle: string;
	readonly workspace: Record<string, unknown>;
	readonly paneRef: string;
	readonly pane: Record<string, unknown>;
	readonly surface: unknown;
}): StackMapParsedCmuxTab | undefined {
	if (!isRecord(options.surface)) return undefined;
	const surfaceRef = stringField(options.surface, "ref");
	const tabRef = stringField(options.surface, "tab_ref") ?? surfaceRef;
	const tabTitle = stringField(options.surface, "title");
	if (surfaceRef === undefined || tabRef === undefined || tabTitle === undefined) return undefined;

	const workspaceDescription = optionalStringField(options.workspace, "description");
	const tty = optionalStringField(options.surface, "tty");
	return {
		windowRef: options.windowRef,
		workspaceRef: options.workspaceRef,
		workspaceTitle: options.workspaceTitle,
		...optionalEntry("workspaceDescription", workspaceDescription),
		paneRef: options.paneRef,
		surfaceRef,
		tabRef,
		tabTitle,
		surfaceType: normalizeSurfaceType(optionalStringField(options.surface, "type")),
		...optionalEntry("tty", tty),
		isActive: booleanField(options.surface, "active") ?? booleanField(options.pane, "active") ?? false,
		isHere: booleanField(options.surface, "here") ?? false,
		isSelected: booleanField(options.surface, "selected") ?? booleanField(options.surface, "selected_in_pane") ?? false,
		...explicitBranchEntry(options.surface, options.pane, options.workspace),
		...explicitWorktreeEntry(options.surface, options.pane, options.workspace),
	};
}

function explicitBranchEntry(...records: readonly Record<string, unknown>[]): { readonly explicitBranch?: string } {
	for (const record of records) {
		const branch = optionalStringField(record, "branch") ?? optionalStringField(record, "branch_name");
		if (branch !== undefined) return { explicitBranch: branch };
	}
	return {};
}

function explicitWorktreeEntry(...records: readonly Record<string, unknown>[]): { readonly explicitWorktreePath?: string } {
	for (const record of records) {
		const path = optionalStringField(record, "worktree_path") ?? optionalStringField(record, "cwd");
		if (path !== undefined) return { explicitWorktreePath: path };
	}
	return {};
}

function childrenByParentName(branches: readonly StackMapGraphBranch[]): ReadonlyMap<string, readonly StackMapGraphBranch[]> {
	const byParent = new Map<string, StackMapGraphBranch[]>();
	for (const branch of branches) {
		if (branch.parent === undefined) continue;
		const children = byParent.get(branch.parent) ?? [];
		children.push(branch);
		byParent.set(branch.parent, children);
	}
	return byParent;
}

function buildGraphBranchTree(
	branchName: string,
	options: {
		readonly branchesByName: ReadonlyMap<string, StackMapGraphBranch>;
		readonly childrenByParent: ReadonlyMap<string, readonly StackMapGraphBranch[]>;
		readonly current: string;
		readonly slotsByBranch: ReadonlyMap<string, readonly StackMapSlotAssignment[]>;
		readonly trunk: string;
		readonly visited: Set<string>;
	},
): StackMapBranchNode {
	const branch = options.branchesByName.get(branchName) ?? { name: branchName, parent: undefined, children: [], needsRestack: false };
	if (options.visited.has(branchName)) return leafBranchNode(branch, options, options.slotsByBranch);
	options.visited.add(branchName);
	const children = (options.childrenByParent.get(branchName) ?? [])
		.map((child) => buildGraphBranchTree(child.name, options));
	return {
		name: branchName,
		graphiteNote: graphiteNoteForBranch(branch, options.current, options.trunk),
		slots: slotsForBranch(branchName, options.slotsByBranch),
		children,
	};
}

function leafBranchNode(
	branch: StackMapGraphBranch,
	stack: Pick<StackMapGraphData, "current" | "trunk">,
	slotsByBranch: ReadonlyMap<string, readonly StackMapSlotAssignment[]>,
): StackMapBranchNode {
	return {
		name: branch.name,
		graphiteNote: graphiteNoteForBranch(branch, stack.current, stack.trunk),
		slots: slotsForBranch(branch.name, slotsByBranch),
	};
}

function graphiteNoteForBranch(branch: StackMapGraphBranch, current: string, trunk: string): string | undefined {
	if (branch.name === trunk) return "repo";
	if (branch.name === current) return "current";
	if (branch.needsRestack) return "needs restack";
	return undefined;
}

function slotsByBranchName(assignments: readonly StackMapSlotAssignment[]): ReadonlyMap<string, readonly StackMapSlotAssignment[]> {
	const byBranch = new Map<string, StackMapSlotAssignment[]>();
	for (const assignment of assignments) {
		const current = byBranch.get(assignment.branch) ?? [];
		current.push(assignment);
		byBranch.set(assignment.branch, current);
	}
	return byBranch;
}

function slotsForBranch(branch: string, slotsByBranch: ReadonlyMap<string, readonly StackMapSlotAssignment[]>): readonly StackMapSlotAssignment[] | undefined {
	const slots = slotsByBranch.get(branch);
	return slots === undefined || slots.length === 0 ? undefined : slots;
}

function collectBranchNames(root: StackMapBranchNode): ReadonlySet<string> {
	const names = new Set<string>();
	const pending = [root];
	while (pending.length > 0) {
		const branch = pending.pop();
		if (branch === undefined || names.has(branch.name)) continue;
		names.add(branch.name);
		pending.push(...(branch.children ?? []));
	}
	return names;
}

function buildUnavailableStackMapModel(diagnostics: readonly string[]): StackMapModel {
	return {
		title: "sdlcc stack map",
		diagnostics: ["Could not load real Graphite stack data.", ...diagnostics],
		currentBranch: "stack-unavailable",
		trunk: {
			name: "stack-unavailable",
			graphiteNote: "error",
		},
	};
}

function normalizeSlotStatus(status: string | undefined): StackMapSlotStatus {
	if (status === "assigned" || status === "available") return status;
	return "unknown";
}

function normalizeSurfaceType(type: string | undefined): StackMapCmuxSurfaceType {
	if (type === "terminal" || type === "browser" || type === "agent-session") return type;
	return "unknown";
}

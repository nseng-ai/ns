import { parseMachineEnvelopeData } from "@ji/core/machine-envelope";
import { optionalEntry } from "@ji/core/primitives";
import { z } from "zod";

import {
	matchCmuxTabsToBranches,
	type StackMapBranchNode,
	type StackMapCmuxSurfaceType,
	type StackMapModel,
	type StackMapParsedCmuxTab,
	type StackMapSlotAssignment,
	type StackMapSlotStatus,
} from "./stack-map.ts";
import {
	formatInlineCommandFailure,
	runRealCommand,
	type CommandRunner,
} from "./command-runner.ts";

export type { CommandOptions, CommandOutput, CommandRunner } from "./command-runner.ts";

const COMMAND_TIMEOUT_MS = 10_000;

export interface LoadStackMapModelOptions {
	readonly cwd?: string;
	readonly runCommand?: CommandRunner;
}

interface StackMapGraphData {
	readonly branches: readonly StackMapGraphBranch[];
	readonly trunk: string;
	readonly current: string;
	readonly slots: readonly StackMapGraphSlot[];
	readonly warnings: readonly string[];
}

interface StackMapGraphBranch {
	readonly name: string;
	readonly parent: string | undefined;
	readonly children: readonly string[];
	readonly validationResult?: string;
	readonly needsRestack: boolean;
}

type StackMapGraphSlot = StackMapSlotAssignment;

const optionalNonEmptyStringSchema = z.preprocess(
	(value) => (typeof value === "string" && value.length > 0 ? value : undefined),
	z.string().optional(),
);

const optionalBooleanSchema = z.preprocess(
	(value) => (typeof value === "boolean" ? value : undefined),
	z.boolean().optional(),
);

const stackMapGraphBranchSchema = z.object({
	name: z.string(),
	parent: optionalNonEmptyStringSchema,
	children: z.array(z.string()),
	validationResult: optionalNonEmptyStringSchema,
	needsRestack: z.boolean(),
});

type StackMapGraphBranchInput = z.infer<typeof stackMapGraphBranchSchema>;

const stackMapGraphEdgeSchema = z.object({
	parent: z.string(),
	child: z.string(),
});

const stackMapGraphSlotSchema = z.object({
	slotName: z.string(),
	branch: z.string(),
	worktreePath: optionalNonEmptyStringSchema,
	status: optionalNonEmptyStringSchema,
});

type StackMapGraphSlotInput = z.infer<typeof stackMapGraphSlotSchema>;

const stackMapGraphDataSchema = z.object({
	branches: z.array(stackMapGraphBranchSchema),
	trunk: z.string(),
	current: z.string(),
	edges: z.array(stackMapGraphEdgeSchema),
	slots: z.array(stackMapGraphSlotSchema),
	warnings: z.array(z.string()),
});

const cmuxTreeSchema = z.object({
	windows: z.array(z.unknown()),
});

const cmuxWindowSchema = z.object({
	ref: z.string(),
	workspaces: z.array(z.unknown()),
});

const cmuxWorkspaceSchema = z.object({
	ref: z.string(),
	title: z.string(),
	description: optionalNonEmptyStringSchema,
	panes: z.array(z.unknown()),
	branch: optionalNonEmptyStringSchema,
	branch_name: optionalNonEmptyStringSchema,
	worktree_path: optionalNonEmptyStringSchema,
	cwd: optionalNonEmptyStringSchema,
});

type CmuxWorkspaceInput = z.infer<typeof cmuxWorkspaceSchema>;

const cmuxPaneSchema = z.object({
	ref: z.string(),
	active: optionalBooleanSchema,
	surfaces: z.array(z.unknown()),
	branch: optionalNonEmptyStringSchema,
	branch_name: optionalNonEmptyStringSchema,
	worktree_path: optionalNonEmptyStringSchema,
	cwd: optionalNonEmptyStringSchema,
});

type CmuxPaneInput = z.infer<typeof cmuxPaneSchema>;

const cmuxSurfaceSchema = z.object({
	ref: z.string(),
	tab_ref: optionalNonEmptyStringSchema,
	title: z.string(),
	type: optionalNonEmptyStringSchema,
	tty: optionalNonEmptyStringSchema,
	active: optionalBooleanSchema,
	here: optionalBooleanSchema,
	selected: optionalBooleanSchema,
	selected_in_pane: optionalBooleanSchema,
	branch: optionalNonEmptyStringSchema,
	branch_name: optionalNonEmptyStringSchema,
	worktree_path: optionalNonEmptyStringSchema,
	cwd: optionalNonEmptyStringSchema,
});

type CmuxSurfaceInput = z.infer<typeof cmuxSurfaceSchema>;

type CmuxEvidenceInput = CmuxWorkspaceInput | CmuxPaneInput | CmuxSurfaceInput;

export async function loadStackMapModel(
	options: LoadStackMapModelOptions = {},
): Promise<StackMapModel> {
	const cwd = options.cwd ?? process.cwd();
	const runCommand = options.runCommand ?? runRealCommand;
	const [graphResult, cmuxResult] = await Promise.all([
		loadStackMapGraph(runCommand, cwd),
		loadCmuxTabs(runCommand, cwd),
	]);
	if (graphResult.type === "failure") {
		return buildUnavailableStackMapModel(
			[graphResult.message, cmuxResult.type === "failure" ? cmuxResult.message : undefined].filter(
				(message): message is string => message !== undefined,
			),
		);
	}

	return buildStackMapModelFromGraph(graphResult.data, {
		cmuxTabs: cmuxResult.type === "success" ? cmuxResult.tabs : [],
		diagnostics: cmuxResult.type === "failure" ? [cmuxResult.message] : [],
	});
}

export function buildStackMapModelFromGraph(
	graph: StackMapGraphData,
	options: {
		readonly cmuxTabs?: readonly StackMapParsedCmuxTab[];
		readonly diagnostics?: readonly string[];
	} = {},
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
	const trunk =
		missing.length === 0
			? root
			: {
					...root,
					children: [
						...root.children,
						...missing.map((branch) => leafBranchNode(branch, graph, slotsByBranch)),
					],
				};
	const model: StackMapModel = {
		title: "jicc stack map",
		diagnostics: [
			"Loaded from `ns slot gt exec stack-map-branches --format json`.",
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

export function parseCmuxTreeTabs(
	stdout: string,
):
	| { type: "success"; tabs: readonly StackMapParsedCmuxTab[] }
	| { type: "failure"; message: string } {
	let parsed: unknown;
	try {
		const trimmedStdout = stdout.trim();
		parsed = JSON.parse(trimmedStdout === "" ? "{}" : trimmedStdout);
	} catch (error) {
		return {
			type: "failure",
			message: `cmux tree JSON was invalid: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	return parseCmuxTreeData(parsed);
}

async function loadStackMapGraph(
	runCommand: CommandRunner,
	cwd: string,
): Promise<{ type: "success"; data: StackMapGraphData } | { type: "failure"; message: string }> {
	const result = await runCommand(
		"ns",
		["slot", "gt", "exec", "stack-map-branches", "--format", "json"],
		{ cwd, timeout: COMMAND_TIMEOUT_MS },
	);
	const parsed = parseStackMapMachineEnvelopeData(
		result.stdout,
		"ns slot gt exec stack-map-branches JSON",
	);
	if (parsed.type === "failure") {
		return {
			type: "failure",
			message: `${parsed.message}${result.stderr.trim() ? ` ${result.stderr.trim()}` : ""}`,
		};
	}
	const data = parseStackMapGraphData(parsed.data);
	if (data.type === "failure") return data;
	return { type: "success", data: data.data };
}

async function loadCmuxTabs(
	runCommand: CommandRunner,
	cwd: string,
): Promise<
	{ type: "success"; tabs: readonly StackMapParsedCmuxTab[] } | { type: "failure"; message: string }
> {
	const result = await runCommand("cmux", ["tree", "--json", "--all"], {
		cwd,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (result.code !== 0)
		return {
			type: "failure",
			message: `Could not load cmux tab inventory: ${formatInlineCommandFailure("cmux tree", result)}`,
		};
	const parsed = parseCmuxTreeTabs(result.stdout);
	if (parsed.type === "failure")
		return { type: "failure", message: `Could not load cmux tab inventory: ${parsed.message}` };
	return parsed;
}

function parseStackMapMachineEnvelopeData(
	stdout: string,
	label: string,
): { type: "success"; data: Record<string, unknown> } | { type: "failure"; message: string } {
	const parsed = parseMachineEnvelopeData(stdout, { label });
	if (parsed.type === "valid") return { type: "success", data: parsed.data };
	return { type: "failure", message: parsed.message };
}

function parseStackMapGraphData(
	data: unknown,
): { type: "success"; data: StackMapGraphData } | { type: "failure"; message: string } {
	if (typeof data !== "object" || data === null || Array.isArray(data))
		return { type: "failure", message: "ns slot gt stack-map data was not an object." };
	const parsed = stackMapGraphDataSchema.safeParse(data);
	if (!parsed.success) {
		return {
			type: "failure",
			message: "ns slot gt stack-map data was missing branches/trunk/current/edges/slots/warnings.",
		};
	}
	return {
		type: "success",
		data: {
			branches: parsed.data.branches.map(stackMapGraphBranchFromInput),
			trunk: parsed.data.trunk,
			current: parsed.data.current,
			slots: parsed.data.slots.map(stackMapGraphSlotFromInput),
			warnings: parsed.data.warnings,
		},
	};
}

function stackMapGraphBranchFromInput(input: StackMapGraphBranchInput): StackMapGraphBranch {
	return {
		name: input.name,
		parent: input.parent,
		children: input.children,
		...optionalEntry("validationResult", input.validationResult),
		needsRestack: input.needsRestack,
	};
}

function stackMapGraphSlotFromInput(input: StackMapGraphSlotInput): StackMapGraphSlot {
	return {
		slotName: input.slotName,
		branch: input.branch,
		...optionalEntry("worktreePath", input.worktreePath),
		status: normalizeSlotStatus(input.status),
	};
}

function parseCmuxTreeData(
	data: unknown,
):
	| { type: "success"; tabs: readonly StackMapParsedCmuxTab[] }
	| { type: "failure"; message: string } {
	if (typeof data !== "object" || data === null || Array.isArray(data))
		return { type: "failure", message: "cmux tree was not a JSON object." };
	const tree = cmuxTreeSchema.safeParse(data);
	if (!tree.success) return { type: "failure", message: "cmux tree was missing windows." };

	const tabs: StackMapParsedCmuxTab[] = [];
	for (const windowInput of tree.data.windows) {
		const window = cmuxWindowSchema.safeParse(windowInput);
		if (!window.success) continue;
		for (const workspaceInput of window.data.workspaces) {
			const workspace = cmuxWorkspaceSchema.safeParse(workspaceInput);
			if (!workspace.success) continue;
			for (const paneInput of workspace.data.panes) {
				const pane = cmuxPaneSchema.safeParse(paneInput);
				if (!pane.success) continue;
				for (const surfaceInput of pane.data.surfaces) {
					const surface = cmuxSurfaceSchema.safeParse(surfaceInput);
					if (!surface.success) continue;
					const tab = parseCmuxSurfaceTab({
						windowRef: window.data.ref,
						workspace: workspace.data,
						pane: pane.data,
						surface: surface.data,
					});
					tabs.push(tab);
				}
			}
		}
	}
	return { type: "success", tabs };
}

function parseCmuxSurfaceTab(options: {
	readonly windowRef: string;
	readonly workspace: CmuxWorkspaceInput;
	readonly pane: CmuxPaneInput;
	readonly surface: CmuxSurfaceInput;
}): StackMapParsedCmuxTab {
	const tabRef = options.surface.tab_ref ?? options.surface.ref;
	return {
		windowRef: options.windowRef,
		workspaceRef: options.workspace.ref,
		workspaceTitle: options.workspace.title,
		...optionalEntry("workspaceDescription", options.workspace.description),
		paneRef: options.pane.ref,
		surfaceRef: options.surface.ref,
		tabRef,
		tabTitle: options.surface.title,
		surfaceType: normalizeSurfaceType(options.surface.type),
		...optionalEntry("tty", options.surface.tty),
		isActive: options.surface.active ?? options.pane.active ?? false,
		isHere: options.surface.here ?? false,
		isSelected: options.surface.selected ?? options.surface.selected_in_pane ?? false,
		...explicitBranchEntry(options.surface, options.pane, options.workspace),
		...explicitWorktreeEntry(options.surface, options.pane, options.workspace),
	};
}

function explicitBranchEntry(...records: readonly CmuxEvidenceInput[]): {
	readonly explicitBranch?: string;
} {
	for (const record of records) {
		const branch = record.branch ?? record.branch_name;
		if (branch !== undefined) return { explicitBranch: branch };
	}
	return {};
}

function explicitWorktreeEntry(...records: readonly CmuxEvidenceInput[]): {
	readonly explicitWorktreePath?: string;
} {
	for (const record of records) {
		const path = record.worktree_path ?? record.cwd;
		if (path !== undefined) return { explicitWorktreePath: path };
	}
	return {};
}

function childrenByParentName(
	branches: readonly StackMapGraphBranch[],
): ReadonlyMap<string, readonly StackMapGraphBranch[]> {
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
	const branch = options.branchesByName.get(branchName) ?? {
		name: branchName,
		parent: undefined,
		children: [],
		needsRestack: false,
	};
	if (options.visited.has(branchName))
		return leafBranchNode(branch, options, options.slotsByBranch);
	options.visited.add(branchName);
	const children = (options.childrenByParent.get(branchName) ?? []).map((child) =>
		buildGraphBranchTree(child.name, options),
	);
	return {
		name: branchName,
		...optionalEntry(
			"graphiteNote",
			graphiteNoteForBranch({ branch, current: options.current, trunk: options.trunk }),
		),
		slots: slotsForBranch(branchName, options.slotsByBranch),
		cmuxTabs: [],
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
		...optionalEntry(
			"graphiteNote",
			graphiteNoteForBranch({ branch, current: stack.current, trunk: stack.trunk }),
		),
		slots: slotsForBranch(branch.name, slotsByBranch),
		cmuxTabs: [],
		children: [],
	};
}

function graphiteNoteForBranch(options: {
	readonly branch: StackMapGraphBranch;
	readonly current: string;
	readonly trunk: string;
}): string | undefined {
	if (options.branch.name === options.trunk) return "repo";
	if (options.branch.name === options.current) return "current";
	if (options.branch.needsRestack) return "needs restack";
	return undefined;
}

function slotsByBranchName(
	assignments: readonly StackMapSlotAssignment[],
): ReadonlyMap<string, readonly StackMapSlotAssignment[]> {
	const byBranch = new Map<string, StackMapSlotAssignment[]>();
	for (const assignment of assignments) {
		const current = byBranch.get(assignment.branch) ?? [];
		current.push(assignment);
		byBranch.set(assignment.branch, current);
	}
	return byBranch;
}

function slotsForBranch(
	branch: string,
	slotsByBranch: ReadonlyMap<string, readonly StackMapSlotAssignment[]>,
): readonly StackMapSlotAssignment[] {
	return slotsByBranch.get(branch) ?? [];
}

function collectBranchNames(root: StackMapBranchNode): ReadonlySet<string> {
	const names = new Set<string>();
	const pending = [root];
	while (pending.length > 0) {
		const branch = pending.pop();
		if (branch === undefined || names.has(branch.name)) continue;
		names.add(branch.name);
		pending.push(...branch.children);
	}
	return names;
}

function buildUnavailableStackMapModel(diagnostics: readonly string[]): StackMapModel {
	return {
		title: "jicc stack map",
		diagnostics: ["Could not load real Graphite stack data.", ...diagnostics],
		currentBranch: "stack-unavailable",
		trunk: {
			name: "stack-unavailable",
			graphiteNote: "error",
			slots: [],
			cmuxTabs: [],
			children: [],
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

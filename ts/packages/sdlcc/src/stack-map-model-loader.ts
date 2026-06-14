import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import type { StackMapBranchNode, StackMapCmuxWorkspace, StackMapPrototypeModel } from "./stack-map-prototype.ts";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 10_000;
const GRAPHITE_METADATA_DB_NAME = ".graphite_metadata.db";
const GRAPHITE_TOPOLOGY_QUERY = "SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata";
const RECENT_BRANCH_LIMIT = 40;

export interface StackMapCommandOutput {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type StackMapCommandRunner = (command: string, args: readonly string[], options: StackMapCommandOptions) => Promise<StackMapCommandOutput>;

export interface StackMapCommandOptions {
	readonly cwd: string;
	readonly timeoutMs: number;
}

export interface LoadStackMapPrototypeModelOptions {
	readonly cwd?: string | undefined;
	readonly runCommand?: StackMapCommandRunner | undefined;
}

interface StackBranchesData {
	readonly branches: readonly string[];
	readonly trunk: string;
	readonly current: string;
	readonly edges: readonly StackBranchEdge[];
	readonly warnings: readonly string[];
}

interface StackBranchEdge {
	readonly parent: string;
	readonly child: string;
}

interface SlotAssignment {
	readonly slotName: string;
	readonly branch: string;
}

interface GraphiteMetadataBranch {
	readonly branch: string;
	readonly parent: string | undefined;
	readonly children: readonly string[];
	readonly isTrunk: boolean;
}

export async function loadStackMapPrototypeModel(options: LoadStackMapPrototypeModelOptions = {}): Promise<StackMapPrototypeModel> {
	const cwd = options.cwd ?? process.cwd();
	const runCommand = options.runCommand ?? runRealCommand;
	const stackResult = await loadStackBranches(runCommand, cwd);
	if (stackResult.type === "failure") return buildUnavailableStackMapModel(stackResult.message);

	const slotResult = await loadSlotAssignments(runCommand, cwd);
	const slotAssignments = slotResult.type === "success" ? slotResult.assignments : [];
	const metadataResult = await loadGraphiteMetadataBranches(runCommand, cwd);
	const recentBranchesResult = await loadRecentLocalBranches(runCommand, cwd);
	if (metadataResult.type === "success") {
		return buildStackMapModelFromMetadata(
			stackResult.data,
			metadataResult.branches,
			slotAssignments,
			recentBranchesResult.type === "success" ? recentBranchesResult.branches : [],
			[slotResult.type === "failure" ? slotResult.message : undefined, recentBranchesResult.type === "failure" ? recentBranchesResult.message : undefined].filter(
				(note): note is string => note !== undefined,
			),
		);
	}

	return buildStackMapModelFromCommands(
		stackResult.data,
		slotAssignments,
		[metadataResult.message, slotResult.type === "failure" ? slotResult.message : undefined].filter((note): note is string => note !== undefined).join(" "),
	);
}

export function buildStackMapModelFromMetadata(
	stack: StackBranchesData,
	metadataBranches: readonly GraphiteMetadataBranch[],
	slotAssignments: readonly SlotAssignment[],
	recentBranches: readonly string[],
	warnings: readonly string[] = [],
): StackMapPrototypeModel {
	const slotLabelsByBranch = new Map(slotAssignments.map((assignment) => [assignment.branch, assignment.slotName]));
	const metadataByBranch = new Map(metadataBranches.map((branch) => [branch.branch, branch]));
	const selectedBranches = selectVisibleMetadataBranches({
		stack,
		metadataByBranch,
		slotAssignments,
		recentBranches,
	});
	const trunk = buildMetadataBranchTree(stack.trunk, {
		metadataByBranch,
		selectedBranches,
		current: stack.current,
		slotLabelsByBranch,
		trunk: stack.trunk,
		visited: new Set(),
	});
	const notes = [
		"Loaded from Graphite metadata DB; row set includes current branch, slot branches, and recent local Graphite branches.",
		...stack.warnings,
		...warnings,
	].filter((note): note is string => note !== undefined && note.length > 0);

	return {
		title: "sdlcc stack-map prototype",
		question: notes.join(" "),
		currentBranch: stack.current,
		trunk,
	};
}

export function buildStackMapModelFromCommands(
	stack: StackBranchesData,
	slotAssignments: readonly SlotAssignment[],
	slotWarning?: string | undefined,
): StackMapPrototypeModel {
	const slotLabelsByBranch = new Map(slotAssignments.map((assignment) => [assignment.branch, assignment.slotName]));
	const childrenByParent = new Map<string, string[]>();
	for (const edge of stack.edges) {
		const children = childrenByParent.get(edge.parent) ?? [];
		children.push(edge.child);
		childrenByParent.set(edge.parent, children);
	}

	const knownBranches = new Set([stack.trunk, ...stack.branches]);
	const root = buildBranchNode(stack.trunk, {
		childrenByParent,
		knownBranches,
		current: stack.current,
		slotLabelsByBranch,
		trunk: stack.trunk,
		visited: new Set(),
	});
	const modeled = collectBranchNames(root);
	const missing = stack.branches.filter((branch) => !modeled.has(branch));
	const trunk = missing.length === 0 ? root : { ...root, children: [...(root.children ?? []), ...missing.map((branch) => leafBranchNode(branch, stack, slotLabelsByBranch))] };
	const notes = [
		"Loaded from `slot gt exec stack-branches --format json`; slot labels from `slot list --format json`.",
		...stack.warnings,
		slotWarning,
	].filter((note): note is string => note !== undefined && note.length > 0);

	return {
		title: "sdlcc stack-map prototype",
		question: notes.join(" "),
		currentBranch: stack.current,
		trunk,
	};
}

async function loadStackBranches(runCommand: StackMapCommandRunner, cwd: string): Promise<{ type: "success"; data: StackBranchesData } | { type: "failure"; message: string }> {
	const result = await runCommand("slot", ["gt", "exec", "stack-branches", "--format", "json"], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
	const parsed = parseMachineEnvelopeData(result.stdout, "slot gt exec stack-branches JSON");
	if (parsed.type === "failure") {
		return { type: "failure", message: `${parsed.message}${result.stderr.trim() ? ` ${result.stderr.trim()}` : ""}` };
	}
	const data = parseStackBranchesData(parsed.data);
	if (data.type === "failure") return data;
	return { type: "success", data: data.data };
}

async function loadSlotAssignments(runCommand: StackMapCommandRunner, cwd: string): Promise<{ type: "success"; assignments: readonly SlotAssignment[] } | { type: "failure"; message: string }> {
	const result = await runCommand("slot", ["list", "--format", "json"], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
	if (result.code !== 0) return { type: "failure", message: `Could not load slot labels: ${result.stderr.trim() || result.stdout.trim() || `slot list exited ${result.code}`}` };

	const parsed = parseMachineEnvelopeData(result.stdout, "slot list JSON");
	if (parsed.type === "failure") return { type: "failure", message: `Could not load slot labels: ${parsed.message}` };
	return parseSlotAssignments(parsed.data);
}

async function loadGraphiteMetadataBranches(runCommand: StackMapCommandRunner, cwd: string): Promise<{ type: "success"; branches: readonly GraphiteMetadataBranch[] } | { type: "failure"; message: string }> {
	const commonDirResult = await runCommand("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
	if (commonDirResult.code !== 0) return { type: "failure", message: `Could not resolve Graphite metadata DB: ${commonDirResult.stderr.trim() || commonDirResult.stdout.trim() || `git rev-parse exited ${commonDirResult.code}`}` };
	const commonDir = commonDirResult.stdout.trim();
	if (commonDir.length === 0) return { type: "failure", message: "Could not resolve Graphite metadata DB: git returned an empty common dir." };

	const dbPath = join(commonDir, GRAPHITE_METADATA_DB_NAME);
	const sqliteResult = await runCommand("sqlite3", ["-readonly", "-json", dbPath, GRAPHITE_TOPOLOGY_QUERY], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
	if (sqliteResult.code !== 0) return { type: "failure", message: `Could not load Graphite metadata DB: ${sqliteResult.stderr.trim() || sqliteResult.stdout.trim() || `sqlite3 exited ${sqliteResult.code}`}` };

	return parseGraphiteMetadataBranches(sqliteResult.stdout);
}

async function loadRecentLocalBranches(runCommand: StackMapCommandRunner, cwd: string): Promise<{ type: "success"; branches: readonly string[] } | { type: "failure"; message: string }> {
	const result = await runCommand("git", ["for-each-ref", "--format=%(refname:short)", "--sort=-committerdate", `--count=${RECENT_BRANCH_LIMIT}`, "refs/heads"], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
	if (result.code !== 0) return { type: "failure", message: `Could not load recent local branches: ${result.stderr.trim() || result.stdout.trim() || `git for-each-ref exited ${result.code}`}` };
	return { type: "success", branches: result.stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0) };
}

async function runRealCommand(command: string, args: readonly string[], options: StackMapCommandOptions): Promise<StackMapCommandOutput> {
	try {
		const result = await execFileAsync(command, [...args], {
			cwd: options.cwd,
			timeout: options.timeoutMs,
		});
		return { code: 0, stdout: result.stdout, stderr: result.stderr };
	} catch (error) {
		return commandFailureOutput(error);
	}
}

function commandFailureOutput(error: unknown): StackMapCommandOutput {
	if (!isRecord(error)) return { code: 1, stdout: "", stderr: String(error) };
	const code = typeof error.code === "number" ? error.code : 1;
	return {
		code,
		stdout: typeof error.stdout === "string" ? error.stdout : "",
		stderr: typeof error.stderr === "string" ? error.stderr : String(error),
	};
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
	if (exitCode !== 0 && exitCode !== 1) return { type: "failure", message: `${label} reported failure exit_code ${String(exitCode)}: ${stringField(parsed, "message") ?? "no message"}` };
	if (!("data" in parsed)) return { type: "failure", message: `${label} did not include data.` };
	return { type: "success", data: parsed.data };
}

function parseStackBranchesData(data: unknown): { type: "success"; data: StackBranchesData } | { type: "failure"; message: string } {
	if (!isRecord(data)) return { type: "failure", message: "slot gt stack data was not an object." };
	const branches = stringArrayField(data, "branches");
	const trunk = stringField(data, "trunk");
	const current = stringField(data, "current");
	const edges = edgeArrayField(data, "edges");
	const warnings = stringArrayField(data, "warnings");
	if (branches === undefined || trunk === undefined || current === undefined || edges === undefined || warnings === undefined) {
		return { type: "failure", message: "slot gt stack data was missing branches/trunk/current/edges/warnings." };
	}
	return { type: "success", data: { branches, trunk, current, edges, warnings } };
}

function parseSlotAssignments(data: unknown): { type: "success"; assignments: readonly SlotAssignment[] } | { type: "failure"; message: string } {
	if (!isRecord(data) || !Array.isArray(data.rows)) return { type: "failure", message: "Could not load slot labels: slot list data was missing rows." };
	const assignments: SlotAssignment[] = [];
	for (const row of data.rows) {
		if (!isRecord(row)) continue;
		const slotName = stringField(row, "slot_name");
		const branch = stringField(row, "branch");
		if (slotName !== undefined && branch !== undefined) assignments.push({ slotName, branch });
	}
	return { type: "success", assignments };
}

function parseGraphiteMetadataBranches(stdout: string): { type: "success"; branches: readonly GraphiteMetadataBranch[] } | { type: "failure"; message: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout.trim() || "[]");
	} catch (error) {
		return { type: "failure", message: `Could not load Graphite metadata DB: sqlite3 JSON was invalid: ${error instanceof Error ? error.message : String(error)}` };
	}
	if (!Array.isArray(parsed)) return { type: "failure", message: "Could not load Graphite metadata DB: sqlite3 JSON was not an array." };

	const branches: GraphiteMetadataBranch[] = [];
	for (const row of parsed) {
		if (!isRecord(row)) return { type: "failure", message: "Could not load Graphite metadata DB: row was not an object." };
		const branch = stringField(row, "branch_name");
		if (branch === undefined) return { type: "failure", message: "Could not load Graphite metadata DB: row was missing branch_name." };
		const children = parseChildrenColumn(row.children);
		if (children === undefined) return { type: "failure", message: `Could not load Graphite metadata DB: children for ${branch} were invalid.` };
		branches.push({
			branch,
			parent: optionalStringField(row, "parent_branch_name"),
			children,
			isTrunk: optionalStringField(row, "validation_result")?.toUpperCase() === "TRUNK",
		});
	}
	return { type: "success", branches };
}

function selectVisibleMetadataBranches(options: {
	readonly stack: StackBranchesData;
	readonly metadataByBranch: ReadonlyMap<string, GraphiteMetadataBranch>;
	readonly slotAssignments: readonly SlotAssignment[];
	readonly recentBranches: readonly string[];
}): ReadonlySet<string> {
	const selected = new Set<string>([options.stack.trunk, options.stack.current, ...options.stack.branches]);
	for (const assignment of options.slotAssignments) selected.add(assignment.branch);
	for (const branch of options.recentBranches) selected.add(branch);

	for (const branch of [...selected]) {
		addAncestors(branch, selected, options.metadataByBranch, options.stack.trunk);
		if (branch !== options.stack.trunk) addDescendants(branch, selected, options.metadataByBranch);
	}
	return selected;
}

function addAncestors(branch: string, selected: Set<string>, metadataByBranch: ReadonlyMap<string, GraphiteMetadataBranch>, trunk: string): void {
	const visited = new Set<string>();
	let cursor: string | undefined = branch;
	while (cursor !== undefined && !visited.has(cursor)) {
		visited.add(cursor);
		selected.add(cursor);
		if (cursor === trunk) return;
		cursor = metadataByBranch.get(cursor)?.parent;
	}
}

function addDescendants(branch: string, selected: Set<string>, metadataByBranch: ReadonlyMap<string, GraphiteMetadataBranch>): void {
	const pending = [...(metadataByBranch.get(branch)?.children ?? [])];
	const visited = new Set<string>();
	while (pending.length > 0) {
		const child = pending.pop();
		if (child === undefined || visited.has(child)) continue;
		visited.add(child);
		selected.add(child);
		pending.push(...(metadataByBranch.get(child)?.children ?? []));
	}
}

function buildMetadataBranchTree(
	branch: string,
	options: {
		readonly metadataByBranch: ReadonlyMap<string, GraphiteMetadataBranch>;
		readonly selectedBranches: ReadonlySet<string>;
		readonly current: string;
		readonly slotLabelsByBranch: ReadonlyMap<string, string>;
		readonly trunk: string;
		readonly visited: Set<string>;
	},
): StackMapBranchNode {
	if (options.visited.has(branch)) return leafBranchNode(branch, { current: options.current, trunk: options.trunk }, options.slotLabelsByBranch);
	options.visited.add(branch);
	const children = (metadataChildren(branch, options.metadataByBranch))
		.filter((child) => options.selectedBranches.has(child))
		.map((child) => buildMetadataBranchTree(child, options));
	return {
		name: branch,
		graphiteNote: graphiteNoteForBranch(branch, options.current, options.trunk),
		workspaces: workspaceForBranch(branch, options.slotLabelsByBranch),
		children,
	};
}

function metadataChildren(branch: string, metadataByBranch: ReadonlyMap<string, GraphiteMetadataBranch>): readonly string[] {
	return metadataByBranch.get(branch)?.children ?? [];
}

function parseChildrenColumn(value: unknown): readonly string[] | undefined {
	if (value === undefined || value === null || value === "") return [];
	if (typeof value !== "string") return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return undefined;
	}
	return Array.isArray(parsed) && parsed.every((child): child is string => typeof child === "string") ? parsed : undefined;
}

function optionalStringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = stringField(record, key);
	return value === undefined || value.length === 0 ? undefined : value;
}

function buildBranchNode(
	branch: string,
	options: {
		readonly childrenByParent: ReadonlyMap<string, readonly string[]>;
		readonly knownBranches: ReadonlySet<string>;
		readonly current: string;
		readonly slotLabelsByBranch: ReadonlyMap<string, string>;
		readonly trunk: string;
		readonly visited: Set<string>;
	},
): StackMapBranchNode {
	if (options.visited.has(branch)) return leafBranchNode(branch, { current: options.current, trunk: options.trunk }, options.slotLabelsByBranch);
	options.visited.add(branch);
	const children = (options.childrenByParent.get(branch) ?? [])
		.filter((child) => options.knownBranches.has(child))
		.map((child) => buildBranchNode(child, options));
	return {
		name: branch,
		graphiteNote: graphiteNoteForBranch(branch, options.current, options.trunk),
		workspaces: workspaceForBranch(branch, options.slotLabelsByBranch),
		children,
	};
}

function leafBranchNode(
	branch: string,
	stack: Pick<StackBranchesData, "current" | "trunk">,
	slotLabelsByBranch: ReadonlyMap<string, string>,
): StackMapBranchNode {
	return {
		name: branch,
		graphiteNote: graphiteNoteForBranch(branch, stack.current, stack.trunk),
		workspaces: workspaceForBranch(branch, slotLabelsByBranch),
	};
}

function graphiteNoteForBranch(branch: string, current: string, trunk: string): string | undefined {
	if (branch === trunk) return "repo";
	if (branch === current) return "current";
	return undefined;
}

function workspaceForBranch(branch: string, slotLabelsByBranch: ReadonlyMap<string, string>): readonly StackMapCmuxWorkspace[] | undefined {
	const slotName = slotLabelsByBranch.get(branch);
	if (slotName === undefined) return undefined;
	return [{ label: slotName }];
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

function buildUnavailableStackMapModel(message: string): StackMapPrototypeModel {
	return {
		title: "sdlcc stack-map prototype",
		question: `Could not load real Graphite stack data. ${message}`,
		currentBranch: "stack-unavailable",
		trunk: {
			name: "stack-unavailable",
			graphiteNote: "error",
		},
	};
}

function edgeArrayField(record: Record<string, unknown>, key: string): readonly StackBranchEdge[] | undefined {
	const value = record[key];
	if (!Array.isArray(value)) return undefined;
	const edges: StackBranchEdge[] = [];
	for (const item of value) {
		if (!isRecord(item)) return undefined;
		const parent = stringField(item, "parent");
		const child = stringField(item, "child");
		if (parent === undefined || child === undefined) return undefined;
		edges.push({ parent, child });
	}
	return edges;
}

function stringArrayField(record: Record<string, unknown>, key: string): readonly string[] | undefined {
	const value = record[key];
	if (!Array.isArray(value)) return undefined;
	return value.every((item): item is string => typeof item === "string") ? value : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

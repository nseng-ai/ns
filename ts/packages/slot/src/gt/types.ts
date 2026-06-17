export interface GtCommandFailure {
	message: string;
	returncode: number | null;
}

export type NoParent = { type: "no_parent" };
export type UntrackedBranch = { type: "untracked_branch"; message: string };

export type WalkTermination = { type: "completed" } | { type: "cycle"; branch: string } | { type: "row_missing"; branch: string };
export type ChildrenCorruptionKind = "not_text" | "invalid_json" | "not_list" | "non_string";

export interface ChildrenCorruption {
	branch: string;
	kind: ChildrenCorruptionKind;
}

export interface StackFork {
	branch: string;
	children: readonly string[];
}

export interface BranchMetadataGraphRow {
	name: string;
	parent: string | null;
	children: readonly string[];
	validation_result: string | null;
	children_corruption: ChildrenCorruption | null;
}

export interface BranchMetadataGraph {
	rows: readonly BranchMetadataGraphRow[];
	empty_branch_name_rows: number;
}

export interface DescendantWalk {
	forks: readonly StackFork[];
	children_corruptions: readonly ChildrenCorruption[];
	termination: WalkTermination;
}

export type TrunkMarkerStatus = { type: "clean" } | { type: "problem"; terminus: string; terminus_state: "row_missing" | "unmarked" | "marked"; marked_trunks: readonly string[] };

export interface StackInfo {
	trunk: string;
	current: string;
	ancestors: readonly string[];
	children: readonly string[];
	descendants: readonly string[];
	ancestor_termination: WalkTermination;
	descendant_walk: DescendantWalk;
	trunk_marker: TrunkMarkerStatus;
	unwalked_children_corruptions: readonly ChildrenCorruption[];
	empty_branch_name_rows: number;
}

const EMPTY_BRANCH_NAME_WARNING = "Graphite metadata row has an empty branch_name; row ignored";

export function branchNeedsRestack(row: BranchMetadataGraphRow): boolean {
	return row.validation_result === "BAD_PARENT_NAME";
}

export function rowsByName(graph: BranchMetadataGraph): Map<string, BranchMetadataGraphRow> {
	return new Map(graph.rows.map((row) => [row.name, row]));
}

export function renderGraphWarnings(graph: BranchMetadataGraph): readonly string[] {
	return [
		...Array.from({ length: graph.empty_branch_name_rows }, () => EMPTY_BRANCH_NAME_WARNING),
		...graph.rows.flatMap((row) => row.children_corruption === null ? [] : [renderChildrenCorruption(row.children_corruption)]),
	];
}

export function renderStackWarnings(stack: StackInfo): readonly string[] {
	const warnings: string[] = [];
	warnings.push(...Array.from({ length: stack.empty_branch_name_rows }, () => EMPTY_BRANCH_NAME_WARNING));
	warnings.push(...stack.unwalked_children_corruptions.map(renderChildrenCorruption));
	warnings.push(...stack.descendant_walk.children_corruptions.map(renderChildrenCorruption));
	if (stack.ancestor_termination.type === "cycle" || stack.ancestor_termination.type === "row_missing") warnings.push(renderAncestorTermination(stack.ancestor_termination));
	warnings.push(...stack.descendant_walk.forks.map(renderStackFork));
	if (stack.descendant_walk.termination.type === "cycle" || stack.descendant_walk.termination.type === "row_missing") warnings.push(renderDescendantTermination(stack.descendant_walk.termination));
	if (stack.trunk_marker.type === "problem") warnings.push(...renderTrunkMarkerProblem(stack.trunk_marker));
	return warnings;
}

export function renderAncestorTermination(termination: Extract<WalkTermination, { type: "cycle" | "row_missing" }>): string {
	if (termination.type === "cycle") return `cycle detected in Graphite parent metadata at ${termination.branch}; ancestor walk stopped`;
	return `parent branch ${termination.branch} is missing from Graphite metadata; ancestor walk stopped`;
}

export function renderDescendantTermination(termination: Extract<WalkTermination, { type: "cycle" | "row_missing" }>): string {
	if (termination.type === "cycle") return `cycle detected in Graphite children metadata at ${termination.branch}; descendant walk stopped`;
	return `child branch ${termination.branch} is missing from Graphite metadata; descendant walk stopped`;
}

export function renderStackFork(fork: StackFork): string {
	return `branch ${fork.branch} has ${fork.children.length} Graphite children; descendants follow the first child only`;
}

export function renderChildrenCorruption(corruption: ChildrenCorruption): string {
	if (corruption.kind === "not_text") return `children metadata for ${corruption.branch} is not JSON text; treating as no children`;
	if (corruption.kind === "invalid_json") return `children metadata for ${corruption.branch} is not valid JSON; treating as no children`;
	if (corruption.kind === "not_list") return `children metadata for ${corruption.branch} is not a JSON list; treating as no children`;
	return `children metadata for ${corruption.branch} contains non-string entries`;
}

export function renderTrunkMarkerProblem(problem: Extract<TrunkMarkerStatus, { type: "problem" }>): readonly string[] {
	if (problem.terminus_state === "row_missing") return ["trunk row marker missing"];
	const warnings: string[] = [];
	if (problem.terminus_state === "unmarked") warnings.push("trunk row marker missing");
	if (problem.marked_trunks.length > 1) warnings.push("multiple Graphite metadata rows are marked as trunk");
	if (problem.marked_trunks.length > 0 && !problem.marked_trunks.includes(problem.terminus)) {
		warnings.push(`Graphite metadata trunk marker differs from ancestor-walk terminus: ${problem.marked_trunks[0]} != ${problem.terminus}`);
	}
	return warnings;
}

export function commandFailure(message: string, returncode: number | null = null): GtCommandFailure {
	return { message, returncode };
}

export interface StackMapCmuxWorkspace {
	readonly label: string;
	readonly isCaller?: boolean;
	readonly isActive?: boolean;
	readonly isDirty?: boolean;
	readonly hasLabelDrift?: boolean;
	readonly tabCount?: number;
}

export interface StackMapBranchNode {
	readonly name: string;
	readonly graphiteNote?: string | undefined;
	readonly workspaces?: readonly StackMapCmuxWorkspace[] | undefined;
	readonly children?: readonly StackMapBranchNode[] | undefined;
}

export interface StackMapPrototypeModel {
	readonly title: string;
	readonly question: string;
	readonly trunk: StackMapBranchNode;
	readonly currentBranch: string;
}

export interface StackMapPrototypeState {
	readonly selectedBranch: string;
	readonly filter: StackMapBranchFilter;
	readonly showQuestion: boolean;
}

export type StackMapBranchFilter = "all" | "cmux";

export type StackMapPrototypeAction =
	| { readonly type: "move-selection"; readonly delta: number }
	| { readonly type: "toggle-filter" }
	| { readonly type: "toggle-question" };

export interface StackMapVisibleRow {
	readonly branch: StackMapBranchNode;
	readonly topo: string;
	readonly depth: number;
	readonly isCurrent: boolean;
	readonly isSelected: boolean;
	readonly branchLabel: string;
	readonly graphiteLabel: string;
	readonly cmuxLabel: string;
}

interface FlatBranchRow {
	readonly branch: StackMapBranchNode;
	readonly topoPrefix: string;
	readonly depth: number;
}

interface StackMapTableWidths {
	readonly branch: number;
	readonly graphite: number;
	readonly cmux: number;
}

export function buildStackMapPrototypeModel(): StackMapPrototypeModel {
	return {
		title: "sdlcc stack-map prototype",
		question:
			"Prototype question: does a branch list with a persistent left-side Graphite topology overlay feel like the right base surface for sdlcc?",
		currentBranch: "sdlcc-stack-map-prototype",
		trunk: {
			name: "main",
			graphiteNote: "repo",
			children: [
				{
					name: "planned-branch-plan-contract",
					graphiteNote: "parent",
					children: [
						{
							name: "branch-context-sdl-hooks",
							graphiteNote: "PR #84",
							workspaces: [{ label: "ws18 slot-03", tabCount: 2 }],
						},
						{
							name: "sdlcc-stack-map-prototype",
							graphiteNote: "current",
							workspaces: [{ label: "ws31 sdlcc", isCaller: true, isActive: true, isDirty: true }],
						},
					],
				},
				{
					name: "brmem-typescript-port",
					graphiteNote: "needs restack",
					workspaces: [{ label: "ws45 slot-09", hasLabelDrift: true }],
					children: [
						{
							name: "brmem-umbrella-playbook-lessons",
							graphiteNote: "upstack",
						},
					],
				},
				{
					name: "large-pr-ci-resilience",
					graphiteNote: "ready",
					children: [
						{
							name: "roaster-bounded-diff-review-coverage",
							graphiteNote: "PR #91",
							workspaces: [{ label: "ws52 slot-12", isDirty: true }],
						},
					],
				},
			],
		},
	};
}

export function createInitialStackMapState(model: StackMapPrototypeModel): StackMapPrototypeState {
	return {
		selectedBranch: model.currentBranch,
		filter: "all",
		showQuestion: true,
	};
}

export function reduceStackMapPrototypeState(
	model: StackMapPrototypeModel,
	state: StackMapPrototypeState,
	action: StackMapPrototypeAction,
): StackMapPrototypeState {
	switch (action.type) {
		case "move-selection":
			return moveSelection(model, state, action.delta);
		case "toggle-filter":
			return keepSelectedVisible(model, {
				...state,
				filter: state.filter === "all" ? "cmux" : "all",
			});
		case "toggle-question":
			return {
				...state,
				showQuestion: !state.showQuestion,
			};
	}
}

export function buildVisibleStackMapRows(model: StackMapPrototypeModel, state: StackMapPrototypeState): readonly StackMapVisibleRow[] {
	const rows = flattenBranchRows(model.trunk, [], 0);
	const visibleRows = rows.filter((row) => state.filter === "all" || hasWorkspace(row.branch));

	return visibleRows.map((row) => {
		const isCurrent = row.branch.name === model.currentBranch;
		const marker = isCurrent ? "◉" : "○";
		const branchLabel = isCurrent ? `${row.branch.name} ← current` : row.branch.name;
		const graphiteLabel = row.branch.graphiteNote ?? "";
		const cmuxLabel = formatCmuxWorkspaces(row.branch.workspaces ?? []);
		return {
			branch: row.branch,
			topo: `${row.topoPrefix}${marker}`,
			depth: row.depth,
			isCurrent,
			isSelected: row.branch.name === state.selectedBranch,
			branchLabel,
			graphiteLabel,
			cmuxLabel,
		};
	});
}

export function renderStackMapPrototypeFrame(model: StackMapPrototypeModel, state: StackMapPrototypeState): string {
	const rows = buildVisibleStackMapRows(model, state);
	const topoWidth = Math.max("TOPO".length, ...rows.map((row) => row.topo.length));
	const tableWidths = buildStackMapTableWidths(rows);
	const selected = rows.find((row) => row.isSelected) ?? rows[0];

	const lines: string[] = [];
	lines.push(model.title);
	if (state.showQuestion) lines.push(model.question);
	lines.push("");
	lines.push(`${"".padEnd(2)}${"TOPO".padEnd(topoWidth)} │ ${formatStackMapTableHeader(tableWidths)}`);
	lines.push(`${"".padEnd(2)}${"─".repeat(topoWidth)}─┼─${formatStackMapTableRule(tableWidths)}`);

	for (const row of rows) {
		const cursor = row.isSelected ? "› " : "  ";
		lines.push(`${cursor}${row.topo.padEnd(topoWidth)} │ ${formatStackMapTableRow(row, tableWidths)}`);
	}

	lines.push("");
	lines.push(renderSelectedBranchState(selected?.branch, state, rows.length));
	lines.push("");
	lines.push("Keys: ↑/k previous  ↓/j next  o cmux-only/all  ? hide/show question  q quit");

	return lines.join("\n");
}

function buildStackMapTableWidths(rows: readonly StackMapVisibleRow[]): StackMapTableWidths {
	return {
		branch: Math.max("BRANCH".length, ...rows.map((row) => row.branchLabel.length)),
		graphite: Math.max("GT".length, ...rows.map((row) => row.graphiteLabel.length)),
		cmux: Math.max("CMUX".length, ...rows.map((row) => row.cmuxLabel.length)),
	};
}

function formatStackMapTableHeader(widths: StackMapTableWidths): string {
	return formatStackMapTableCells("BRANCH", "GT", "CMUX", widths);
}

function formatStackMapTableRule(widths: StackMapTableWidths): string {
	return ["─".repeat(widths.branch), "─".repeat(widths.graphite), "─".repeat(widths.cmux)].join("─┼─");
}

function formatStackMapTableRow(row: StackMapVisibleRow, widths: StackMapTableWidths): string {
	return formatStackMapTableCells(row.branchLabel, row.graphiteLabel, row.cmuxLabel, widths);
}

function formatStackMapTableCells(branch: string, graphite: string, cmux: string, widths: StackMapTableWidths): string {
	return `${branch.padEnd(widths.branch)} │ ${graphite.padEnd(widths.graphite)} │ ${cmux.padEnd(widths.cmux)}`;
}

function moveSelection(model: StackMapPrototypeModel, state: StackMapPrototypeState, delta: number): StackMapPrototypeState {
	const rows = buildVisibleStackMapRows(model, state);
	if (rows.length === 0) return state;

	const currentIndex = rows.findIndex((row) => row.branch.name === state.selectedBranch);
	const safeIndex = currentIndex === -1 ? 0 : currentIndex;
	const nextIndex = wrapIndex(safeIndex + delta, rows.length);
	const nextRow = rows[nextIndex];
	if (nextRow === undefined) return state;

	return {
		...state,
		selectedBranch: nextRow.branch.name,
	};
}

function keepSelectedVisible(model: StackMapPrototypeModel, state: StackMapPrototypeState): StackMapPrototypeState {
	const rows = buildVisibleStackMapRows(model, state);
	if (rows.some((row) => row.branch.name === state.selectedBranch)) return state;

	const firstRow = rows[0];
	if (firstRow === undefined) return state;

	return {
		...state,
		selectedBranch: firstRow.branch.name,
	};
}

function flattenBranchRows(
	branch: StackMapBranchNode,
	ancestorLastFlags: readonly boolean[],
	depth: number,
	isLastSibling = true,
): readonly FlatBranchRow[] {
	const topoPrefix = buildTopoPrefix(ancestorLastFlags, depth, isLastSibling);
	const rows: FlatBranchRow[] = [{ branch, topoPrefix, depth }];
	const children = branch.children ?? [];

	children.forEach((child, index) => {
		const isLast = index === children.length - 1;
		rows.push(...flattenBranchRows(child, [...ancestorLastFlags, isLastSibling], depth + 1, isLast));
	});

	return rows;
}

function buildTopoPrefix(ancestorLastFlags: readonly boolean[], depth: number, isLastSibling: boolean): string {
	if (depth === 0) return "";

	const parentGuides = ancestorLastFlags.slice(1).map((isLast) => (isLast ? "  " : "│ ")).join("");
	const connector = isLastSibling ? "└─" : "├─";
	return `${parentGuides}${connector}`;
}

function formatCmuxWorkspaces(workspaces: readonly StackMapCmuxWorkspace[]): string {
	if (workspaces.length === 0) return "";

	return workspaces.map(formatCmuxWorkspace).join("  ");
}

function formatCmuxWorkspace(workspace: StackMapCmuxWorkspace): string {
	const badges: string[] = [];
	if (workspace.isActive) badges.push("●");
	else badges.push("○");
	if (workspace.isCaller) badges.push("◎");
	badges.push(workspace.label);
	if (workspace.isDirty) badges.push("DIRTY");
	if (workspace.hasLabelDrift) badges.push("↯label");
	if (workspace.tabCount !== undefined && workspace.tabCount > 1) badges.push(`${workspace.tabCount}t`);
	return badges.join(" ");
}

function renderSelectedBranchState(
	branch: StackMapBranchNode | undefined,
	state: StackMapPrototypeState,
	visibleCount: number,
): string {
	if (branch === undefined) return `State: filter=${state.filter}; visibleBranches=0; selected=<none>`;

	return [
		`State: filter=${state.filter}; visibleBranches=${visibleCount}; selected=${branch.name}`,
		`Selected details: graphite=${branch.graphiteNote ?? ""}; cmux=${formatCmuxWorkspaces(branch.workspaces ?? []) || "none"}`,
	].join("\n");
}

function hasWorkspace(branch: StackMapBranchNode): boolean {
	return (branch.workspaces?.length ?? 0) > 0;
}

function wrapIndex(index: number, length: number): number {
	return ((index % length) + length) % length;
}

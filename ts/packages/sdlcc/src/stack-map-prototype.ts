export type StackMapSlotStatus = "assigned" | "available" | "unknown";

export interface StackMapSlotAssignment {
	readonly slotName: string;
	readonly branch: string;
	readonly worktreePath?: string | undefined;
	readonly status: StackMapSlotStatus;
}

export type StackMapCmuxSurfaceType = "terminal" | "browser" | "agent-session" | "unknown";

export interface StackMapParsedCmuxTab {
	readonly windowRef: string;
	readonly workspaceRef: string;
	readonly workspaceTitle: string;
	readonly workspaceDescription?: string | undefined;
	readonly paneRef: string;
	readonly surfaceRef: string;
	readonly tabRef: string;
	readonly tabTitle: string;
	readonly surfaceType: StackMapCmuxSurfaceType;
	readonly tty?: string | undefined;
	readonly isActive: boolean;
	readonly isHere: boolean;
	readonly isSelected: boolean;
	readonly explicitBranch?: string | undefined;
	readonly explicitWorktreePath?: string | undefined;
}

export type StackMapCmuxTabMatch =
	| { readonly type: "slot-worktree"; readonly slotName: string; readonly worktreePath: string }
	| { readonly type: "explicit-branch"; readonly branch: string }
	| { readonly type: "explicit-worktree"; readonly worktreePath: string };

export interface StackMapCmuxTabTarget extends StackMapParsedCmuxTab {
	readonly match: StackMapCmuxTabMatch;
}

export interface StackMapBranchNode {
	readonly name: string;
	readonly graphiteNote?: string | undefined;
	readonly slots?: readonly StackMapSlotAssignment[] | undefined;
	readonly cmuxTabs?: readonly StackMapCmuxTabTarget[] | undefined;
	readonly children?: readonly StackMapBranchNode[] | undefined;
}

export interface StackMapPrototypeModel {
	readonly title: string;
	readonly question: string;
	readonly trunk: StackMapBranchNode;
	readonly currentBranch: string;
}

export type StackMapBranchFilter = "all" | "cmux";

export type StackMapCmuxChoice =
	| { readonly type: "tab"; readonly target: StackMapCmuxTabTarget }
	| { readonly type: "open-new"; readonly branch: string; readonly slot?: StackMapSlotAssignment | undefined };

export type StackMapPrototypeMode =
	| { readonly type: "rows" }
	| { readonly type: "cmux-choice"; readonly branch: string; readonly choices: readonly StackMapCmuxChoice[]; readonly selectedIndex: number };

export interface StackMapPrototypeState {
	readonly selectedBranch: string;
	readonly filter: StackMapBranchFilter;
	readonly showQuestion: boolean;
	readonly mode: StackMapPrototypeMode;
	readonly statusMessage?: string | undefined;
}

export type StackMapPrototypeAction =
	| { readonly type: "move-selection"; readonly delta: number }
	| { readonly type: "toggle-filter" }
	| { readonly type: "toggle-question" }
	| { readonly type: "show-cmux-choice"; readonly branch: string; readonly choices: readonly StackMapCmuxChoice[] }
	| { readonly type: "move-choice"; readonly delta: number }
	| { readonly type: "cancel-choice" }
	| { readonly type: "set-status"; readonly message: string };

export type StackMapCmuxActivationPlan =
	| { readonly type: "open-new"; readonly branch: string; readonly slot?: StackMapSlotAssignment | undefined }
	| { readonly type: "focus-tab"; readonly branch: string; readonly target: StackMapCmuxTabTarget }
	| { readonly type: "choose-tab"; readonly branch: string; readonly targets: readonly StackMapCmuxTabTarget[]; readonly includeOpenNew: true; readonly slot?: StackMapSlotAssignment | undefined }
	| { readonly type: "unavailable"; readonly branch?: string | undefined; readonly reason: string };

export interface StackMapVisibleRow {
	readonly branch: StackMapBranchNode;
	readonly topo: string;
	readonly laneIndex: number;
	readonly isCurrent: boolean;
	readonly isSelected: boolean;
	readonly branchLabel: string;
	readonly graphiteLabel: string;
	readonly cmuxLabel: string;
}

interface GtLsTopologyRow {
	readonly branch: StackMapBranchNode;
	readonly topo: string;
	readonly laneIndex: number;
	readonly isTrunkJoin: boolean;
}

interface StackMapTableWidths {
	readonly branch: number;
	readonly graphite: number;
	readonly cmux: number;
}

export function buildStackMapPrototypeModel(): StackMapPrototypeModel {
	const currentSlot: StackMapSlotAssignment = {
		slotName: "slot-05",
		branch: "sdlcc-stack-map-prototype",
		worktreePath: "/repo/worktrees/slot-05",
		status: "assigned",
	};
	const currentTab: StackMapCmuxTabTarget = {
		windowRef: "window:1",
		workspaceRef: "workspace:31",
		workspaceTitle: "sdlcc-stack-map-prototype",
		paneRef: "pane:31",
		surfaceRef: "surface:31",
		tabRef: "tab:31",
		tabTitle: "π - slot-05",
		surfaceType: "terminal",
		isActive: true,
		isHere: true,
		isSelected: true,
		match: { type: "slot-worktree", slotName: currentSlot.slotName, worktreePath: currentSlot.worktreePath ?? "" },
	};

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
							slots: [{ slotName: "slot-03", branch: "branch-context-sdl-hooks", status: "assigned" }],
						},
						{
							name: "sdlcc-stack-map-prototype",
							graphiteNote: "current",
							slots: [currentSlot],
							cmuxTabs: [currentTab],
						},
					],
				},
				{
					name: "brmem-typescript-port",
					graphiteNote: "needs restack",
					slots: [{ slotName: "slot-09", branch: "brmem-typescript-port", status: "assigned" }],
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
							slots: [{ slotName: "slot-12", branch: "roaster-bounded-diff-review-coverage", status: "assigned" }],
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
		mode: { type: "rows" },
	};
}

export function reduceStackMapPrototypeState(
	model: StackMapPrototypeModel,
	state: StackMapPrototypeState,
	action: StackMapPrototypeAction,
): StackMapPrototypeState {
	switch (action.type) {
		case "move-selection":
			return state.mode.type === "rows" ? moveSelection(model, state, action.delta) : state;
		case "toggle-filter":
			return keepSelectedVisible(model, {
				...state,
				filter: state.filter === "all" ? "cmux" : "all",
				mode: { type: "rows" },
			});
		case "toggle-question":
			return {
				...state,
				showQuestion: !state.showQuestion,
			};
		case "show-cmux-choice":
			return {
				...state,
				mode: { type: "cmux-choice", branch: action.branch, choices: action.choices, selectedIndex: 0 },
				statusMessage: `Choose a cmux tab for ${action.branch}.`,
			};
		case "move-choice":
			return moveCmuxChoice(state, action.delta);
		case "cancel-choice":
			return { ...state, mode: { type: "rows" }, statusMessage: "Cancelled cmux chooser." };
		case "set-status":
			return { ...state, mode: { type: "rows" }, statusMessage: action.message };
	}
}

export function buildVisibleStackMapRows(model: StackMapPrototypeModel, state: StackMapPrototypeState): readonly StackMapVisibleRow[] {
	return buildGtLsTopologyRows(model, state.filter).map((row) => {
		const isCurrent = row.branch.name === model.currentBranch;
		const branchLabel = isCurrent ? `${row.branch.name} ← current` : row.branch.name;
		const graphiteLabel = row.branch.graphiteNote ?? "";
		const cmuxLabel = formatCmuxColumn(row.branch);
		return {
			branch: row.branch,
			topo: row.topo,
			laneIndex: row.laneIndex,
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
	if (state.mode.type === "cmux-choice") {
		lines.push("");
		lines.push(...renderCmuxChooser(state.mode));
	}
	lines.push("");
	lines.push(renderFooter(state));

	return lines.join("\n");
}

export function getSelectedStackMapBranch(model: StackMapPrototypeModel, state: StackMapPrototypeState): StackMapBranchNode | undefined {
	return collectStackMapBranches(model.trunk).find((branch) => branch.name === state.selectedBranch);
}

export function planStackMapCmuxActivation(model: StackMapPrototypeModel, state: StackMapPrototypeState): StackMapCmuxActivationPlan {
	const branch = getSelectedStackMapBranch(model, state);
	if (branch === undefined) return { type: "unavailable", reason: "No selected branch is visible." };

	const targets = branch.cmuxTabs ?? [];
	const slot = branch.slots?.[0];
	if (targets.length === 0) return slot === undefined ? { type: "open-new", branch: branch.name } : { type: "open-new", branch: branch.name, slot };
	if (targets.length === 1) {
		const target = targets[0];
		return target === undefined ? { type: "unavailable", branch: branch.name, reason: "Selected branch has an unreadable cmux tab target." } : { type: "focus-tab", branch: branch.name, target };
	}
	return slot === undefined
		? { type: "choose-tab", branch: branch.name, targets, includeOpenNew: true }
		: { type: "choose-tab", branch: branch.name, targets, includeOpenNew: true, slot };
}

export function choicesForCmuxActivationPlan(plan: StackMapCmuxActivationPlan): readonly StackMapCmuxChoice[] {
	if (plan.type !== "choose-tab") return [];
	return [
		...plan.targets.map((target): StackMapCmuxChoice => ({ type: "tab", target })),
		plan.slot === undefined ? { type: "open-new", branch: plan.branch } : { type: "open-new", branch: plan.branch, slot: plan.slot },
	];
}

export function matchCmuxTabsToBranches(options: {
	readonly root: StackMapBranchNode;
	readonly slots: readonly StackMapSlotAssignment[];
	readonly tabs: readonly StackMapParsedCmuxTab[];
}): StackMapBranchNode {
	return attachTargets(options.root, options);
}

function attachTargets(
	branch: StackMapBranchNode,
	options: { readonly slots: readonly StackMapSlotAssignment[]; readonly tabs: readonly StackMapParsedCmuxTab[] },
): StackMapBranchNode {
	const matched = options.tabs.flatMap((tab) => {
		const target = targetForBranch(tab, branch.name, options.slots);
		return target === undefined ? [] : [target];
	});
	return {
		...branch,
		...(matched.length === 0 ? {} : { cmuxTabs: matched }),
		children: branch.children?.map((child) => attachTargets(child, options)),
	};
}

function targetForBranch(tab: StackMapParsedCmuxTab, branch: string, slots: readonly StackMapSlotAssignment[]): StackMapCmuxTabTarget | undefined {
	if (tab.explicitBranch === branch) {
		return { ...tab, match: { type: "explicit-branch", branch } };
	}

	const tabWorktree = normalizedPath(tab.explicitWorktreePath);
	if (tabWorktree === undefined) return undefined;
	const slot = slots.find((assignment) => assignment.branch === branch && normalizedPath(assignment.worktreePath) === tabWorktree);
	if (slot?.worktreePath !== undefined) {
		return { ...tab, match: { type: "slot-worktree", slotName: slot.slotName, worktreePath: slot.worktreePath } };
	}
	return undefined;
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

function moveCmuxChoice(state: StackMapPrototypeState, delta: number): StackMapPrototypeState {
	if (state.mode.type !== "cmux-choice") return state;
	return {
		...state,
		mode: {
			...state.mode,
			selectedIndex: wrapIndex(state.mode.selectedIndex + delta, state.mode.choices.length),
		},
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

function buildGtLsTopologyRows(model: StackMapPrototypeModel, filter: StackMapBranchFilter): readonly GtLsTopologyRow[] {
	const lanes = sortBranchesByName(model.trunk.children ?? []).filter((branch) => filter === "all" || hasCmuxEvidenceInSubtree(branch));
	const rows: GtLsTopologyRow[] = [];
	lanes.forEach((branch, laneIndex) => rows.push(...buildLaneRows(branch, laneIndex, model.currentBranch)));
	rows.push({ branch: model.trunk, topo: trunkTopo(model.trunk, model.currentBranch, lanes.length), laneIndex: lanes.length, isTrunkJoin: lanes.length > 0 });
	return rows;
}

function buildLaneRows(branch: StackMapBranchNode, laneIndex: number, currentBranch: string): readonly GtLsTopologyRow[] {
	const rows: GtLsTopologyRow[] = [];
	for (const child of sortBranchesByName(branch.children ?? [])) rows.push(...buildLaneRows(child, laneIndex, currentBranch));
	rows.push({ branch, topo: `${"│ ".repeat(laneIndex)}${branchMarker(branch, currentBranch)}`, laneIndex, isTrunkJoin: false });
	return rows;
}

function trunkTopo(trunk: StackMapBranchNode, currentBranch: string, laneCount: number): string {
	const marker = branchMarker(trunk, currentBranch);
	if (laneCount === 0) return marker;
	return `${marker}${"─┴".repeat(Math.max(laneCount - 1, 0))}─┘`;
}

function branchMarker(branch: StackMapBranchNode, currentBranch: string): string {
	return branch.name === currentBranch ? "◉" : "◯";
}

function sortBranchesByName(branches: readonly StackMapBranchNode[]): readonly StackMapBranchNode[] {
	return [...branches].sort((left, right) => compareBranchNames(left.name, right.name));
}

function compareBranchNames(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function collectStackMapBranches(root: StackMapBranchNode): readonly StackMapBranchNode[] {
	const branches: StackMapBranchNode[] = [];
	collectBranchPostOrder(root, branches);
	return branches;
}

function collectBranchPostOrder(branch: StackMapBranchNode, branches: StackMapBranchNode[]): void {
	for (const child of branch.children ?? []) collectBranchPostOrder(child, branches);
	branches.push(branch);
}

function formatCmuxColumn(branch: StackMapBranchNode): string {
	const tabs = branch.cmuxTabs ?? [];
	if (tabs.length === 1) {
		const tab = tabs[0];
		return tab === undefined ? "" : formatTabLabel(tab);
	}
	if (tabs.length > 1) return `${tabs.length} tabs`;
	return formatSlotAssignments(branch.slots ?? []);
}

function formatSlotAssignments(slots: readonly StackMapSlotAssignment[]): string {
	if (slots.length === 0) return "";
	return slots.map((slot) => slot.slotName).join("  ");
}

function formatTabLabel(tab: StackMapCmuxTabTarget): string {
	const badges: string[] = [];
	if (tab.isActive) badges.push("●");
	else badges.push("○");
	if (tab.isHere) badges.push("◎");
	badges.push(tab.workspaceTitle || tab.workspaceRef);
	if (tab.tabTitle.length > 0 && tab.tabTitle !== tab.workspaceTitle) badges.push(`/ ${tab.tabTitle}`);
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
		`Selected details: graphite=${branch.graphiteNote ?? ""}; slots=${formatSlotAssignments(branch.slots ?? []) || "none"}; cmux=${formatCmuxColumn(branch) || "none"}`,
		`Action: ${cmuxActionHint(branch)}`,
		state.statusMessage === undefined ? undefined : `Status: ${state.statusMessage}`,
	].filter((line): line is string => line !== undefined).join("\n");
}

function renderCmuxChooser(mode: Extract<StackMapPrototypeMode, { type: "cmux-choice" }>): readonly string[] {
	return [
		`Cmux chooser for ${mode.branch}:`,
		...mode.choices.map((choice, index) => `${index === mode.selectedIndex ? "›" : " "} ${formatCmuxChoice(choice)}`),
	];
}

function formatCmuxChoice(choice: StackMapCmuxChoice): string {
	if (choice.type === "open-new") return "Open new cmux tab/workspace anyway";
	return [
		choice.target.workspaceTitle || choice.target.workspaceRef,
		choice.target.tabTitle || choice.target.tabRef,
		choice.target.paneRef,
		choice.target.surfaceRef,
		choice.target.isActive ? "active" : undefined,
		choice.target.isHere ? "here" : undefined,
	].filter((part): part is string => part !== undefined && part.length > 0).join("  ");
}

function renderFooter(state: StackMapPrototypeState): string {
	if (state.mode.type === "cmux-choice") return "Keys: ↑/k previous  ↓/j next  Enter activate  Esc cancel chooser  q quit";
	return "Keys: ↑/k previous  ↓/j next  c cmux  o cmux-only/all  ? hide/show question  q/Esc quit";
}

function cmuxActionHint(branch: StackMapBranchNode): string {
	const tabs = branch.cmuxTabs ?? [];
	if (tabs.length === 0) return "c: open cmux workspace";
	if (tabs.length === 1) {
		const tab = tabs[0];
		return tab === undefined ? "c: cmux unavailable" : `c: focus cmux tab ${tab.workspaceTitle || tab.workspaceRef}/${tab.tabTitle || tab.tabRef}`;
	}
	return `c: choose among ${tabs.length} cmux tabs`;
}

function hasCmuxEvidence(branch: StackMapBranchNode): boolean {
	return (branch.slots?.length ?? 0) > 0 || (branch.cmuxTabs?.length ?? 0) > 0;
}

function hasCmuxEvidenceInSubtree(branch: StackMapBranchNode): boolean {
	return hasCmuxEvidence(branch) || (branch.children ?? []).some((child) => hasCmuxEvidenceInSubtree(child));
}

function normalizedPath(path: string | undefined): string | undefined {
	if (path === undefined || path.length === 0) return undefined;
	return path.replace(/\/+$/, "");
}

function wrapIndex(index: number, length: number): number {
	return ((index % length) + length) % length;
}

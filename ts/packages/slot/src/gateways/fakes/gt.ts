import type { ChildrenOfResult, ParentOfResult, SlotGtGateway, StackInfo, StackResult, TrunkResult } from "../gt.ts";

export type FakeSlotGtOperation =
	| { type: "parent-of"; cwd: string }
	| { type: "children-of"; cwd: string }
	| { type: "trunk"; cwd: string }
	| { type: "stack"; cwd: string };

export interface FakeSlotGtGatewayOptions {
	parent?: ParentOfResult | undefined;
	children?: ChildrenOfResult | undefined;
	trunk?: TrunkResult | undefined;
	stack?: StackResult | undefined;
}

export class FakeSlotGtGateway implements SlotGtGateway {
	private readonly parentResult: ParentOfResult;
	private readonly childrenResult: ChildrenOfResult;
	private readonly trunkResult: TrunkResult;
	private readonly stackResult: StackResult;
	private readonly log: FakeSlotGtOperation[] = [];

	constructor(options: FakeSlotGtGatewayOptions = {}) {
		this.parentResult = options.parent ?? { type: "no_parent" };
		this.childrenResult = options.children ?? { type: "children", branches: [] };
		this.trunkResult = options.trunk ?? { type: "trunk", branch: "master" };
		this.stackResult = options.stack ?? { type: "stack", stack: fakeStackInfo() };
	}

	async parentOf(cwd: string): Promise<ParentOfResult> {
		this.log.push({ type: "parent-of", cwd });
		return copyParentResult(this.parentResult);
	}

	async childrenOf(cwd: string): Promise<ChildrenOfResult> {
		this.log.push({ type: "children-of", cwd });
		return copyChildrenResult(this.childrenResult);
	}

	async trunk(cwd: string): Promise<TrunkResult> {
		this.log.push({ type: "trunk", cwd });
		return copyTrunkResult(this.trunkResult);
	}

	async stack(cwd: string): Promise<StackResult> {
		this.log.push({ type: "stack", cwd });
		return copyStackResult(this.stackResult);
	}

	operations(): readonly FakeSlotGtOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

export function fakeStackInfo(overrides: Partial<StackInfo> = {}): StackInfo {
	return {
		trunk: overrides.trunk ?? "master",
		current: overrides.current ?? "feature/current",
		ancestors: [...(overrides.ancestors ?? ["master"])],
		descendants: [...(overrides.descendants ?? [])],
		ancestorTermination: overrides.ancestorTermination ?? { type: "completed" },
		descendantWalk: overrides.descendantWalk ?? { forks: [], childrenCorruptions: [], termination: { type: "completed" } },
		trunkMarker: overrides.trunkMarker ?? { type: "clean" },
	};
}

function copyParentResult(result: ParentOfResult): ParentOfResult {
	switch (result.type) {
		case "parent": return { type: "parent", branch: result.branch };
		case "no_parent": return { type: "no_parent" };
		case "untracked_branch": return { type: "untracked_branch", message: result.message };
		case "failure": return { type: "failure", failure: { ...result.failure } };
	}
}

function copyChildrenResult(result: ChildrenOfResult): ChildrenOfResult {
	switch (result.type) {
		case "children": return { type: "children", branches: [...result.branches] };
		case "untracked_branch": return { type: "untracked_branch", message: result.message };
		case "failure": return { type: "failure", failure: { ...result.failure } };
	}
}

function copyTrunkResult(result: TrunkResult): TrunkResult {
	return result.type === "trunk" ? { type: "trunk", branch: result.branch } : { type: "failure", failure: { ...result.failure } };
}

function copyStackResult(result: StackResult): StackResult {
	if (result.type === "untracked_branch") return { type: "untracked_branch", message: result.message };
	if (result.type === "failure") return { type: "failure", failure: { ...result.failure } };
	return { type: "stack", stack: fakeStackInfo(result.stack) };
}

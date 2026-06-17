import type { SlotGtGateway } from "../gt.ts";
import type { BranchMetadataGraph, GtCommandFailure, StackInfo, UntrackedBranch } from "../../gt/types.ts";

export interface FakeSlotGtGatewayOptions {
	parents?: Readonly<Record<string, string | null>> | undefined;
	children?: Readonly<Record<string, readonly string[]>> | undefined;
	trunk?: string | GtCommandFailure | undefined;
	stack?: StackInfo | UntrackedBranch | GtCommandFailure | undefined;
	graph?: BranchMetadataGraph | GtCommandFailure | undefined;
	untracked?: UntrackedBranch | undefined;
	failures?: Partial<Record<"parent" | "children", GtCommandFailure>> | undefined;
}

export type FakeSlotGtOperation = { type: "parent" | "children" | "trunk" | "stack" | "metadataGraph"; cwd: string };

export class FakeSlotGtGateway implements SlotGtGateway {
	private readonly parents: Readonly<Record<string, string | null>>;
	private readonly childrenByBranch: Readonly<Record<string, readonly string[]>>;
	private readonly trunkValue: string | GtCommandFailure;
	private readonly stackValue: StackInfo | UntrackedBranch | GtCommandFailure | null;
	private readonly graphValue: BranchMetadataGraph | GtCommandFailure | null;
	private readonly untracked: UntrackedBranch | null;
	private readonly failures: Partial<Record<"parent" | "children", GtCommandFailure>>;
	private readonly log: FakeSlotGtOperation[] = [];

	constructor(options: FakeSlotGtGatewayOptions = {}) {
		this.parents = options.parents ?? {};
		this.childrenByBranch = options.children ?? {};
		this.trunkValue = options.trunk ?? "master";
		this.stackValue = options.stack ?? null;
		this.graphValue = options.graph ?? null;
		this.untracked = options.untracked ?? null;
		this.failures = options.failures ?? {};
	}

	async parentOf(cwd: string) {
		this.log.push({ type: "parent", cwd });
		if (this.untracked !== null) return this.untracked;
		const failure = this.failures.parent;
		if (failure !== undefined) return { type: "failure" as const, failure };
		const parent = this.parents[cwd];
		return parent === undefined || parent === null ? { type: "no_parent" as const } : { type: "branch" as const, branch: parent };
	}

	async childrenOf(cwd: string) {
		this.log.push({ type: "children", cwd });
		if (this.untracked !== null) return this.untracked;
		const failure = this.failures.children;
		if (failure !== undefined) return { type: "failure" as const, failure };
		return { type: "children" as const, children: this.childrenByBranch[cwd] ?? [] };
	}

	async trunk(cwd: string) {
		this.log.push({ type: "trunk", cwd });
		if (typeof this.trunkValue === "string") return { type: "trunk" as const, branch: this.trunkValue };
		return { type: "failure" as const, failure: this.trunkValue };
	}

	async stack(cwd: string) {
		this.log.push({ type: "stack", cwd });
		if (this.untracked !== null) return this.untracked;
		if (this.stackValue !== null) {
			if ("returncode" in this.stackValue) return { type: "failure" as const, failure: this.stackValue };
			if ("type" in this.stackValue && this.stackValue.type === "untracked_branch") return this.stackValue;
			return { type: "stack" as const, stack: this.stackValue as StackInfo };
		}
		return { type: "failure" as const, failure: { message: "fake stack not configured", returncode: null } };
	}

	async metadataGraph(cwd: string) {
		this.log.push({ type: "metadataGraph", cwd });
		if (this.graphValue !== null && "rows" in this.graphValue) return { type: "graph" as const, graph: this.graphValue };
		return { type: "failure" as const, failure: this.graphValue ?? { message: "fake metadata graph not configured", returncode: null } };
	}

	operations(): readonly FakeSlotGtOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

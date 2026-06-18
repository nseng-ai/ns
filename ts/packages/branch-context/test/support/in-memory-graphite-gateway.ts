import type {
	GraphiteBranchTrackedResult,
	GraphiteCheckBranchTrackedParams,
	GraphiteErrorInfo,
	GraphiteOperationResult,
	GraphiteTrackBranchParams,
	BranchContextGraphiteGateway,
} from "../../src/graphite-gateway.ts";

export interface InMemoryGraphiteGatewayState {
	checkFailure?: GraphiteErrorInfo | undefined;
	trackFailure?: GraphiteErrorInfo | undefined;
	untrackedBranches?: readonly string[] | ReadonlySet<string> | undefined;
	untrackedDetail?: string | undefined;
}

export interface GraphiteCheckBranchTrackedCall {
	cwd: string;
	branch: string;
}

export interface GraphiteTrackBranchCall {
	cwd: string;
	branch: string;
	parentBranch: string;
}

export class InMemoryBranchContextGraphiteGateway implements BranchContextGraphiteGateway {
	private readonly checkFailure: GraphiteErrorInfo | undefined;
	private readonly trackFailure: GraphiteErrorInfo | undefined;
	private readonly untrackedBranches: ReadonlySet<string>;
	private readonly untrackedDetail: string;
	private readonly checkBranchTrackedLog: GraphiteCheckBranchTrackedCall[] = [];
	private readonly trackBranchLog: GraphiteTrackBranchCall[] = [];

	constructor(state: InMemoryGraphiteGatewayState = {}) {
		this.checkFailure = state.checkFailure;
		this.trackFailure = state.trackFailure;
		this.untrackedBranches = new Set(state.untrackedBranches ?? []);
		this.untrackedDetail =
			state.untrackedDetail ?? "ERROR: Cannot perform this operation on untracked branch.";
	}

	get checkBranchTrackedCalls(): readonly GraphiteCheckBranchTrackedCall[] {
		return this.checkBranchTrackedLog.map((call) => ({ ...call }));
	}

	get trackBranchCalls(): readonly GraphiteTrackBranchCall[] {
		return this.trackBranchLog.map((call) => ({ ...call }));
	}

	async checkBranchTracked(
		params: GraphiteCheckBranchTrackedParams,
	): Promise<GraphiteBranchTrackedResult> {
		this.checkBranchTrackedLog.push({ cwd: params.cwd, branch: params.branch });
		if (this.checkFailure !== undefined) {
			return { ok: false, error: this.checkFailure };
		}
		if (this.untrackedBranches.has(params.branch)) {
			return { ok: true, tracked: false, detail: this.untrackedDetail };
		}
		return { ok: true, tracked: true };
	}

	async trackBranch(params: GraphiteTrackBranchParams): Promise<GraphiteOperationResult> {
		this.trackBranchLog.push({
			cwd: params.cwd,
			branch: params.branch,
			parentBranch: params.parentBranch,
		});
		if (this.trackFailure !== undefined) {
			return { ok: false, error: this.trackFailure };
		}
		return { ok: true };
	}
}

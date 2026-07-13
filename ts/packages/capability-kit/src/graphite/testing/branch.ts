import type {
	GraphiteBranchTrackedResult,
	GraphiteCheckBranchTrackedParams,
	GraphiteErrorInfo,
	GraphiteOperationResult,
	GraphiteTrackBranchParams,
	GraphiteBranchGateway,
	GraphiteTrunkBranchParams,
	GraphiteTrunkBranchResult,
} from "../branch.ts";

export interface InMemoryGraphiteGatewayState {
	checkFailure?: GraphiteErrorInfo;
	trackFailure?: GraphiteErrorInfo;
	trunk?: string | Extract<GraphiteTrunkBranchResult, { ok: false }>;
	untrackedBranches?: readonly string[] | ReadonlySet<string>;
	untrackedDetail?: string;
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

export interface GraphiteTrunkBranchCall {
	cwd: string;
}

export class InMemoryGraphiteBranchGateway implements GraphiteBranchGateway {
	private readonly checkFailure: GraphiteErrorInfo | undefined;
	private readonly trackFailure: GraphiteErrorInfo | undefined;
	private readonly trunkState: string | Extract<GraphiteTrunkBranchResult, { ok: false }>;
	private readonly untrackedBranches: ReadonlySet<string>;
	private readonly untrackedDetail: string;
	private readonly checkBranchTrackedLog: GraphiteCheckBranchTrackedCall[] = [];
	private readonly trackBranchLog: GraphiteTrackBranchCall[] = [];
	private readonly trunkBranchLog: GraphiteTrunkBranchCall[] = [];

	constructor(state: InMemoryGraphiteGatewayState = {}) {
		this.checkFailure = state.checkFailure;
		this.trackFailure = state.trackFailure;
		const trunk = state.trunk ?? "main";
		this.trunkState = typeof trunk === "string" ? trunk : { ...trunk, error: { ...trunk.error } };
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

	get trunkBranchCalls(): readonly GraphiteTrunkBranchCall[] {
		return this.trunkBranchLog.map((call) => ({ ...call }));
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

	async trunkBranch(params: GraphiteTrunkBranchParams): Promise<GraphiteTrunkBranchResult> {
		this.trunkBranchLog.push({ cwd: params.cwd });
		if (typeof this.trunkState === "string") {
			return { ok: true, branch: this.trunkState };
		}
		return { ...this.trunkState, error: { ...this.trunkState.error } };
	}
}

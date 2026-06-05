import type {
	GraphiteErrorInfo,
	GraphiteOperationResult,
	GraphiteTrackBranchParams,
	PlannedBranchGraphiteGateway,
} from "../../src/graphite-gateway.ts";

export interface InMemoryGraphiteGatewayState {
	trackFailure?: GraphiteErrorInfo | undefined;
}

export interface GraphiteTrackBranchCall {
	cwd: string;
	branch: string;
	parentBranch: string;
}

export class InMemoryPlannedBranchGraphiteGateway implements PlannedBranchGraphiteGateway {
	private readonly trackFailure: GraphiteErrorInfo | undefined;
	private readonly trackBranchLog: GraphiteTrackBranchCall[] = [];

	constructor(state: InMemoryGraphiteGatewayState = {}) {
		this.trackFailure = state.trackFailure;
	}

	get trackBranchCalls(): readonly GraphiteTrackBranchCall[] {
		return this.trackBranchLog.map((call) => ({ ...call }));
	}

	async trackBranch(params: GraphiteTrackBranchParams): Promise<GraphiteOperationResult> {
		this.trackBranchLog.push({ cwd: params.cwd, branch: params.branch, parentBranch: params.parentBranch });
		if (this.trackFailure !== undefined) {
			return { ok: false, error: this.trackFailure };
		}
		return { ok: true };
	}
}

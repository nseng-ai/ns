import type {
	AutopilotBranchParams,
	AutopilotCwdParams,
	AutopilotErrorInfo,
	AutopilotGateway,
	AutopilotMessageParams,
	AutopilotOperationResult,
	AutopilotResult,
	AutopilotStageParams,
} from "./gateway.ts";

export interface FakeAutopilotGatewayState {
	changedPaths?: readonly string[];
	/** Returned by `uncommittedChangedPaths` once `formatFix` has run, simulating autofixer output. */
	changedPathsAfterFormatFix?: readonly string[];
	changedPathsFailure?: AutopilotErrorInfo;
	diffCheckFailure?: AutopilotErrorInfo;
	branchTrackedFailure?: AutopilotErrorInfo;
	stageFailure?: AutopilotErrorInfo;
	graphiteModifyFailure?: AutopilotErrorInfo;
	graphiteModifyOutput?: string;
	commitFailure?: AutopilotErrorInfo;
	commitOutput?: string;
	/** Fails `formatCheck` until `formatFix` has been called once. */
	formatCheckFailure?: AutopilotErrorInfo;
	formatFixFailure?: AutopilotErrorInfo;
	submitFailure?: AutopilotErrorInfo;
	submitOutput?: string;
}

export interface FakeAutopilotGatewayCalls {
	graphiteBranchTracked: AutopilotBranchParams[];
	stageFiles: AutopilotStageParams[];
	graphiteModify: AutopilotMessageParams[];
	commit: AutopilotMessageParams[];
	formatCheck: AutopilotCwdParams[];
	formatFix: AutopilotCwdParams[];
	submit: AutopilotCwdParams[];
}

export class FakeAutopilotGateway implements AutopilotGateway {
	private readonly state: FakeAutopilotGatewayState;
	private hasRunFormatFix = false;
	readonly calls: FakeAutopilotGatewayCalls = {
		graphiteBranchTracked: [],
		stageFiles: [],
		graphiteModify: [],
		commit: [],
		formatCheck: [],
		formatFix: [],
		submit: [],
	};

	constructor(state: FakeAutopilotGatewayState = {}) {
		this.state = state;
	}

	async uncommittedChangedPaths(): Promise<AutopilotResult<readonly string[]>> {
		if (this.state.changedPathsFailure !== undefined) {
			return { ok: false, error: this.state.changedPathsFailure };
		}
		if (this.hasRunFormatFix && this.state.changedPathsAfterFormatFix !== undefined) {
			return { ok: true, value: this.state.changedPathsAfterFormatFix };
		}
		return { ok: true, value: this.state.changedPaths ?? [] };
	}

	async diffCheck(): Promise<AutopilotOperationResult> {
		if (this.state.diffCheckFailure !== undefined) {
			return { ok: false, error: this.state.diffCheckFailure };
		}
		return { ok: true };
	}

	async graphiteBranchTracked(params: AutopilotBranchParams): Promise<AutopilotOperationResult> {
		this.calls.graphiteBranchTracked.push(params);
		if (this.state.branchTrackedFailure !== undefined) {
			return { ok: false, error: this.state.branchTrackedFailure };
		}
		return { ok: true };
	}

	async stageFiles(params: AutopilotStageParams): Promise<AutopilotOperationResult> {
		this.calls.stageFiles.push(params);
		if (this.state.stageFailure !== undefined) return { ok: false, error: this.state.stageFailure };
		return { ok: true };
	}

	async graphiteModify(params: AutopilotMessageParams): Promise<AutopilotResult<string>> {
		this.calls.graphiteModify.push(params);
		if (this.state.graphiteModifyFailure !== undefined) {
			return { ok: false, error: this.state.graphiteModifyFailure };
		}
		return { ok: true, value: this.state.graphiteModifyOutput ?? "modified" };
	}

	async commit(params: AutopilotMessageParams): Promise<AutopilotResult<string>> {
		this.calls.commit.push(params);
		if (this.state.commitFailure !== undefined) {
			return { ok: false, error: this.state.commitFailure };
		}
		return { ok: true, value: this.state.commitOutput ?? "committed" };
	}

	async formatCheck(params: AutopilotCwdParams): Promise<AutopilotOperationResult> {
		this.calls.formatCheck.push(params);
		if (this.state.formatCheckFailure !== undefined && !this.hasRunFormatFix) {
			return { ok: false, error: this.state.formatCheckFailure };
		}
		return { ok: true };
	}

	async formatFix(params: AutopilotCwdParams): Promise<AutopilotOperationResult> {
		this.calls.formatFix.push(params);
		this.hasRunFormatFix = true;
		if (this.state.formatFixFailure !== undefined) {
			return { ok: false, error: this.state.formatFixFailure };
		}
		return { ok: true };
	}

	async submit(params: AutopilotCwdParams): Promise<AutopilotResult<string>> {
		this.calls.submit.push(params);
		if (this.state.submitFailure !== undefined) {
			return { ok: false, error: this.state.submitFailure };
		}
		return {
			ok: true,
			value: this.state.submitOutput ?? "https://github.com/example/repo/pull/1\n",
		};
	}
}

import type {
	GsConsumerGateway,
	GsOperationResult,
	GsResult,
	GsStackInspection,
} from "./gs-gateway.ts";

export interface InMemoryGsGatewayState {
	inspection?: GsResult<GsStackInspection>;
	addResult?: GsOperationResult;
	initializeResult?: GsOperationResult;
}

export class InMemoryGsGateway implements GsConsumerGateway {
	private readonly inspection: GsResult<GsStackInspection>;
	private readonly addResult: GsOperationResult;
	private readonly initializeResult: GsOperationResult;
	private readonly inspectionLog: Array<{ cwd: string }> = [];
	private readonly addLog: Array<{ cwd: string; targetBranch: string }> = [];
	private readonly initializeLog: Array<{
		cwd: string;
		trunkBranch: string;
		branches: readonly string[];
	}> = [];

	constructor(state: InMemoryGsGatewayState = {}) {
		this.inspection = state.inspection ?? { ok: true, value: { type: "unstacked" } };
		this.addResult = state.addResult ?? { ok: true };
		this.initializeResult = state.initializeResult ?? { ok: true };
	}

	get inspectionCalls(): readonly { cwd: string }[] {
		return this.inspectionLog.map((call) => ({ ...call }));
	}

	get addCalls(): readonly { cwd: string; targetBranch: string }[] {
		return this.addLog.map((call) => ({ ...call }));
	}

	get initializeCalls(): readonly {
		cwd: string;
		trunkBranch: string;
		branches: readonly string[];
	}[] {
		return this.initializeLog.map((call) => ({ ...call, branches: [...call.branches] }));
	}

	async inspectLocalStack(options: { cwd: string }): Promise<GsResult<GsStackInspection>> {
		this.inspectionLog.push({ cwd: options.cwd });
		return cloneResult(this.inspection);
	}

	async addAboveCurrentStack(options: {
		cwd: string;
		targetBranch: string;
	}): Promise<GsOperationResult> {
		this.addLog.push({ cwd: options.cwd, targetBranch: options.targetBranch });
		return cloneOperationResult(this.addResult);
	}

	async initializeStack(options: {
		cwd: string;
		trunkBranch: string;
		branches: readonly string[];
	}): Promise<GsOperationResult> {
		this.initializeLog.push({
			cwd: options.cwd,
			trunkBranch: options.trunkBranch,
			branches: [...options.branches],
		});
		return cloneOperationResult(this.initializeResult);
	}
}

function cloneResult<T>(result: GsResult<T>): GsResult<T> {
	return result.ok
		? { ok: true, value: structuredClone(result.value) }
		: { ok: false, error: { ...result.error } };
}

function cloneOperationResult(result: GsOperationResult): GsOperationResult {
	return result.ok ? { ok: true } : { ok: false, error: { ...result.error } };
}

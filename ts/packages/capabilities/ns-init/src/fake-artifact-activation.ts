import type {
	ApplyPreparedDeclaredArtifactActivationResult,
	PreparedDeclaredArtifactActivation,
} from "@nseng-ai/harness-artifacts/api";

import type {
	ArtifactActivationGateway,
	PrepareArtifactActivationParams,
	PrepareArtifactActivationResult,
} from "./artifact-activation.ts";

export interface InMemoryArtifactActivationState {
	readonly prepareResult?: PrepareArtifactActivationResult;
	readonly applyResult?: ApplyPreparedDeclaredArtifactActivationResult;
}

export class InMemoryArtifactActivationGateway implements ArtifactActivationGateway {
	private readonly prepareResult: PrepareArtifactActivationResult | undefined;
	private readonly applyResult: ApplyPreparedDeclaredArtifactActivationResult;
	private readonly prepareLog: PrepareArtifactActivationParams[] = [];
	private readonly applyLog: PreparedDeclaredArtifactActivation[] = [];

	constructor(state: InMemoryArtifactActivationState = {}) {
		this.prepareResult =
			state.prepareResult === undefined ? undefined : copyPrepareResult(state.prepareResult);
		this.applyResult = copyApplyResult(state.applyResult ?? { ok: true, completed: [] });
	}

	async prepare(params: PrepareArtifactActivationParams): Promise<PrepareArtifactActivationResult> {
		this.prepareLog.push({
			repoRoot: params.repoRoot,
			descriptors: [...params.descriptors],
			harnesses: [...params.harnesses],
		});
		return copyPrepareResult(
			this.prepareResult ?? {
				ok: true,
				prepared: {
					modules: [],
					selectedHarnesses: [...params.harnesses],
					diagnostics: [],
					skippedCollisions: [],
					artifacts: [],
				},
			},
		);
	}

	async apply(
		prepared: PreparedDeclaredArtifactActivation,
	): Promise<ApplyPreparedDeclaredArtifactActivationResult> {
		this.applyLog.push(copyPrepared(prepared));
		return copyApplyResult(this.applyResult);
	}

	prepareCalls(): readonly PrepareArtifactActivationParams[] {
		return this.prepareLog.map((call) => ({
			...call,
			descriptors: [...call.descriptors],
			harnesses: [...call.harnesses],
		}));
	}

	applyCalls(): readonly PreparedDeclaredArtifactActivation[] {
		return this.applyLog.map(copyPrepared);
	}
}

function copyPrepareResult(
	result: PrepareArtifactActivationResult,
): PrepareArtifactActivationResult {
	return structuredClone(result);
}

function copyApplyResult(
	result: ApplyPreparedDeclaredArtifactActivationResult,
): ApplyPreparedDeclaredArtifactActivationResult {
	return structuredClone(result);
}

function copyPrepared(
	prepared: PreparedDeclaredArtifactActivation,
): PreparedDeclaredArtifactActivation {
	return structuredClone(prepared);
}

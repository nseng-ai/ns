import {
	createEmptyPreparedHarnessArtifactTransitions,
	type ApplyPreparedDeclaredArtifactActivationResult,
	type PreparedDeclaredArtifactActivation,
} from "../harness-artifacts/api.ts";

import type {
	PrepareUserArtifactActivationParams,
	PrepareUserArtifactActivationResult,
	UserArtifactActivationGateway,
} from "./user-artifact-activation.ts";

export interface InMemoryUserArtifactActivationState {
	readonly prepareResult?: PrepareUserArtifactActivationResult;
	readonly applyResult?: ApplyPreparedDeclaredArtifactActivationResult;
}

export class InMemoryUserArtifactActivationGateway implements UserArtifactActivationGateway {
	private readonly prepareResult: PrepareUserArtifactActivationResult | undefined;
	private readonly applyResult: ApplyPreparedDeclaredArtifactActivationResult;
	private readonly prepareLog: PrepareUserArtifactActivationParams[] = [];
	private readonly applyLog: PreparedDeclaredArtifactActivation[] = [];

	constructor(state: InMemoryUserArtifactActivationState = {}) {
		this.prepareResult =
			state.prepareResult === undefined ? undefined : structuredClone(state.prepareResult);
		this.applyResult = structuredClone(state.applyResult ?? { ok: true, completed: [] });
	}

	async prepare(
		params: PrepareUserArtifactActivationParams,
	): Promise<PrepareUserArtifactActivationResult> {
		this.prepareLog.push(copyPrepareParams(params));
		return structuredClone(
			this.prepareResult ?? {
				ok: true,
				prepared: {
					modules: [],
					selectedHarnesses: [...params.configuredHarnesses],
					diagnostics: [],
					skippedCollisions: [],
					artifacts: [],
					reconciliation: createEmptyPreparedHarnessArtifactTransitions({
						type: "strict",
						shouldForce: false,
					}),
				},
			},
		);
	}

	async apply(
		prepared: PreparedDeclaredArtifactActivation,
	): Promise<ApplyPreparedDeclaredArtifactActivationResult> {
		this.applyLog.push(structuredClone(prepared));
		return structuredClone(this.applyResult);
	}

	prepareCalls(): readonly PrepareUserArtifactActivationParams[] {
		return this.prepareLog.map(copyPrepareParams);
	}

	applyCalls(): readonly PreparedDeclaredArtifactActivation[] {
		return this.applyLog.map((prepared) => structuredClone(prepared));
	}
}

function copyPrepareParams(
	params: PrepareUserArtifactActivationParams,
): PrepareUserArtifactActivationParams {
	return {
		cwd: params.cwd,
		descriptors: structuredClone(params.descriptors),
		configuredHarnesses: [...params.configuredHarnesses],
		targetPackageNames: [...params.targetPackageNames],
	};
}

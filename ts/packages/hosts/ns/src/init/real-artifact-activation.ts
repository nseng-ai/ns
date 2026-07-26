import {
	applyPreparedDeclaredArtifactActivation,
	prepareDeclaredArtifactActivation,
	type DeclaredExtensionModuleArtifactFacts,
} from "../harness-artifacts/api.ts";

import type {
	ArtifactActivationGateway,
	PrepareArtifactActivationParams,
	PrepareArtifactActivationResult,
} from "./artifact-activation.ts";

export class RealArtifactActivationGateway implements ArtifactActivationGateway {
	async prepare(params: PrepareArtifactActivationParams): Promise<PrepareArtifactActivationResult> {
		const modules: DeclaredExtensionModuleArtifactFacts[] = params.descriptors.map((record) => ({
			moduleRoot: record.moduleRoot,
			packageName: record.packageName,
			version: record.version,
			descriptor: record.descriptor,
		}));
		const result = await prepareDeclaredArtifactActivation({
			projectRoot: params.repoRoot,
			modules,
			selectedHarnesses: params.harnesses,
		});
		return result.ok ? { ok: true, prepared: result.value } : { ok: false, error: result.error };
	}

	async apply(prepared: Parameters<ArtifactActivationGateway["apply"]>[0]) {
		return applyPreparedDeclaredArtifactActivation(prepared);
	}
}

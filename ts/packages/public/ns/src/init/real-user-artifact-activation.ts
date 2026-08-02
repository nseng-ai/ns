import {
	applyPreparedDeclaredArtifactActivation,
	prepareUserDeclaredArtifactActivation,
	type DeclaredExtensionModuleArtifactFacts,
	type PreparedDeclaredArtifactActivation,
} from "../harness-artifacts/api.ts";

import type {
	PrepareUserArtifactActivationParams,
	PrepareUserArtifactActivationResult,
	UserArtifactActivationGateway,
} from "./user-artifact-activation.ts";

export class RealUserArtifactActivationGateway implements UserArtifactActivationGateway {
	private readonly env: Record<string, string | undefined>;
	private readonly homeDir: string | undefined;

	constructor(options: {
		readonly env: Record<string, string | undefined>;
		readonly homeDir?: string;
	}) {
		this.env = { ...options.env };
		this.homeDir = options.homeDir;
	}

	async prepare(
		params: PrepareUserArtifactActivationParams,
	): Promise<PrepareUserArtifactActivationResult> {
		const modules: DeclaredExtensionModuleArtifactFacts[] = params.descriptors.map((record) => ({
			moduleRoot: record.moduleRoot,
			packageName: record.packageName,
			version: record.version,
			descriptor: record.descriptor,
		}));
		const result = await prepareUserDeclaredArtifactActivation({
			cwd: params.cwd,
			...(this.homeDir === undefined ? {} : { homeDir: this.homeDir }),
			env: this.env,
			modules,
			configuredHarnesses: params.configuredHarnesses,
			targetPackageNames: params.targetPackageNames,
		});
		return result.ok ? { ok: true, prepared: result.value } : { ok: false, error: result.error };
	}

	async apply(prepared: PreparedDeclaredArtifactActivation) {
		return applyPreparedDeclaredArtifactActivation(prepared);
	}
}

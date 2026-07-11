import type {
	ApplyPreparedDeclaredArtifactActivationResult,
	HarnessArtifactProvisionErrorInfo,
	HarnessId,
	HarnessPathErrorInfo,
	PreparedDeclaredArtifactActivation,
} from "@nseng-ai/harness-artifacts/api";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/kernel/extensions/declared-descriptors";

export interface PrepareArtifactActivationParams {
	readonly repoRoot: string;
	readonly descriptors: readonly DeclaredExtensionDescriptor[];
	readonly harnesses: readonly HarnessId[];
}

export type PrepareArtifactActivationResult =
	| { readonly ok: true; readonly prepared: PreparedDeclaredArtifactActivation }
	| {
			readonly ok: false;
			readonly error: HarnessArtifactProvisionErrorInfo | HarnessPathErrorInfo;
	  };

export interface ArtifactActivationGateway {
	prepare(params: PrepareArtifactActivationParams): Promise<PrepareArtifactActivationResult>;
	apply(
		prepared: PreparedDeclaredArtifactActivation,
	): Promise<ApplyPreparedDeclaredArtifactActivationResult>;
}

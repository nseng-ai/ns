import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";
import type { HarnessId } from "@nseng-ai/sdk/project-config/harness-identity";

import type {
	ApplyPreparedDeclaredArtifactActivationResult,
	HarnessArtifactProvisionErrorInfo,
	HarnessPathErrorInfo,
	PreparedDeclaredArtifactActivation,
} from "../harness-artifacts/api.ts";

export interface PrepareUserArtifactActivationParams {
	readonly cwd: string;
	readonly descriptors: readonly DeclaredExtensionDescriptor[];
	readonly configuredHarnesses: readonly HarnessId[];
	readonly targetPackageNames: readonly string[];
}

export type PrepareUserArtifactActivationResult =
	| { readonly ok: true; readonly prepared: PreparedDeclaredArtifactActivation }
	| {
			readonly ok: false;
			readonly error: HarnessArtifactProvisionErrorInfo | HarnessPathErrorInfo;
	  };

/** Semantic seam for targeted user-scope bundled-artifact reconciliation. */
export interface UserArtifactActivationGateway {
	prepare(
		params: PrepareUserArtifactActivationParams,
	): Promise<PrepareUserArtifactActivationResult>;
	apply(
		prepared: PreparedDeclaredArtifactActivation,
	): Promise<ApplyPreparedDeclaredArtifactActivationResult>;
}

import type { HarnessId } from "@nseng-ai/harness-artifacts/api";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";

export type ArtifactProvisioningStatus =
	| "none"
	| "provisioned"
	| "needs-reconcile"
	| "conflicted"
	| "unavailable";

export interface ArtifactProvisioningDiagnostic {
	readonly code: string;
	readonly message: string;
	readonly path?: string;
}

export interface ArtifactProvisioningStatusSummary {
	readonly moduleRoot: string;
	readonly artifactStatus: ArtifactProvisioningStatus;
	readonly artifactCount: number;
	readonly affectedArtifactCount: number;
	readonly diagnostics: readonly ArtifactProvisioningDiagnostic[];
}

export interface InspectArtifactProvisioningStatusParams {
	readonly repoRoot: string;
	readonly descriptors: readonly DeclaredExtensionDescriptor[];
	readonly harnesses: readonly HarnessId[];
}

export interface ArtifactProvisioningStatusGateway {
	inspect(
		params: InspectArtifactProvisioningStatusParams,
	): Promise<readonly ArtifactProvisioningStatusSummary[]>;
}

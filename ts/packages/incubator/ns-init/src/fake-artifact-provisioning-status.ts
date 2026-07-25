import type {
	ArtifactProvisioningStatusGateway,
	ArtifactProvisioningStatusSummary,
	InspectArtifactProvisioningStatusParams,
} from "./artifact-provisioning-status.ts";

export interface InMemoryArtifactProvisioningStatusState {
	readonly summaries?: readonly ArtifactProvisioningStatusSummary[];
}

export class InMemoryArtifactProvisioningStatusGateway implements ArtifactProvisioningStatusGateway {
	private readonly summaries: readonly ArtifactProvisioningStatusSummary[] | undefined;
	private readonly inspectLog: InspectArtifactProvisioningStatusParams[] = [];

	constructor(state: InMemoryArtifactProvisioningStatusState = {}) {
		this.summaries = state.summaries === undefined ? undefined : structuredClone(state.summaries);
	}

	async inspect(
		params: InspectArtifactProvisioningStatusParams,
	): Promise<readonly ArtifactProvisioningStatusSummary[]> {
		this.inspectLog.push(structuredClone(params));
		return structuredClone(
			this.summaries ??
				params.descriptors.map((descriptor) => ({
					moduleRoot: descriptor.moduleRoot,
					artifactStatus: "none" as const,
					artifactCount: 0,
					affectedArtifactCount: 0,
					diagnostics: [],
				})),
		);
	}

	inspectCalls(): readonly InspectArtifactProvisioningStatusParams[] {
		return structuredClone(this.inspectLog);
	}
}

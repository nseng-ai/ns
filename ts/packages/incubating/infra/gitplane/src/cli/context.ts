import type { ArtifactGateway, ArtifactIdGenerator } from "../core/index.ts";
export interface GitplaneCliContext {
	readonly artifactGateway: Pick<ArtifactGateway, "createArtifact">;
	readonly artifactIds: ArtifactIdGenerator;
}

import type { ArtifactGateway, ArtifactIdGenerator } from "../core/index.ts";
import type { GitplaneConfigGateway } from "./config-gateway.ts";
export interface GitplaneCliContext {
	readonly artifactGateway: Pick<
		ArtifactGateway,
		"createArtifact" | "inventoryWorkingTree" | "readWorkingTreeCandidate"
	>;
	readonly artifactIds: ArtifactIdGenerator;
	readonly configGateway: GitplaneConfigGateway;
	readonly cwd: string;
}

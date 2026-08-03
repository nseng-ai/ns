import type { ArtifactGateway, ArtifactIdGenerator, CorpusCheckGateway } from "../core/index.ts";
import type { GitplaneConfigGateway } from "./config-gateway.ts";
export interface GitplaneCliContext {
	readonly artifactGateway: Pick<ArtifactGateway, "createArtifact">;
	readonly artifactIds: ArtifactIdGenerator;
	readonly configGateway: GitplaneConfigGateway;
	readonly corpusCheckGateway: CorpusCheckGateway;
	readonly cwd: string;
}

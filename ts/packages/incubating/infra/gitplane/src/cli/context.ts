import type { ArtifactGateway, ArtifactIdGenerator } from "../core/index.ts";
import type { GitplaneConfigLoader } from "./config-loader.ts";
export interface GitplaneCliContext {
	readonly artifactGateway: ArtifactGateway;
	readonly artifactIds: ArtifactIdGenerator;
	readonly configLoader: GitplaneConfigLoader;
	readonly cwd: string;
}

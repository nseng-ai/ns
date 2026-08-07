import type { ArtifactGateway, ArtifactIdGenerator, Clock } from "../core/index.ts";
import type { GitplaneConfigGateway } from "./config-gateway.ts";
export interface GitplaneCliContext {
	readonly artifactGateway: ArtifactGateway;
	readonly artifactIds: ArtifactIdGenerator;
	readonly configGateway: GitplaneConfigGateway;
	readonly clock: Clock;
	readonly cwd: string;
}

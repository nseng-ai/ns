import type { GitGateway } from "@nseng-ai/capability-kit/git";

import type { ActivationFilesGateway } from "./activation-files.ts";
import type { ArtifactActivationGateway } from "./artifact-activation.ts";
import type { DeclaredExtensionsGateway } from "./declared-extensions.ts";

export interface NsActivationContext {
	readonly git: GitGateway;
	readonly files: ActivationFilesGateway;
	readonly declaredExtensions: DeclaredExtensionsGateway;
	readonly artifacts: ArtifactActivationGateway;
}

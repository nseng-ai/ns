import type { GitGateway } from "@nseng-ai/foundation/git";
import type { RepositoryTrunkConfigLoader } from "@nseng-ai/extension-kit/repository-trunk";

import type { ActivationFilesGateway } from "./activation-files.ts";
import type { ArtifactActivationGateway } from "./artifact-activation.ts";
import type { DeclaredExtensionsGateway } from "./declared-extensions.ts";
import type { LifecycleTraceSink } from "./lifecycle-observability.ts";

export interface NsActivationContext {
	readonly git: GitGateway;
	readonly repositoryTrunkConfig?: RepositoryTrunkConfigLoader;
	readonly files: ActivationFilesGateway;
	readonly declaredExtensions: DeclaredExtensionsGateway;
	readonly artifacts: ArtifactActivationGateway;
	readonly lifecycleTrace?: LifecycleTraceSink;
}

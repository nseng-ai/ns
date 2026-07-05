import type { GitGateway } from "@nseng-ai/capability-kit/git";

import type { ActivationFilesGateway } from "./activation-files.ts";
import type { SkillMaterializer } from "./skill-materializer.ts";

export interface ObjectiveActivationContext {
	git: GitGateway;
	files: ActivationFilesGateway;
	skills: SkillMaterializer;
}

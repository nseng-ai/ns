import { createNsGitGateway } from "@nseng-ai/capability-kit/git";
import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";

import type { ObjectiveActivationContext } from "../activation-context.ts";
import { pendingBundleSkillMaterializer } from "../pending-bundle-skill-materializer.ts";
import { RealActivationFilesGateway } from "../real-activation-files.ts";

export function createNsInitContext(
	ctx: NsExtensionApi,
): ObjectiveActivationContext & { cwd: string } {
	return {
		cwd: ctx.cwd,
		git: createNsGitGateway(ctx),
		files: new RealActivationFilesGateway(),
		skills: pendingBundleSkillMaterializer,
	};
}

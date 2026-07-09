import { createNsGitGateway } from "@nseng-ai/capability-kit/git";
import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";

import type { NsActivationContext } from "../activation-context.ts";
import { RealActivationFilesGateway } from "../real-activation-files.ts";
import { RealArtifactActivationGateway } from "../real-artifact-activation.ts";
import { RealDeclaredExtensionsGateway } from "../declared-extensions.ts";

export function createNsInitContext(ctx: NsExtensionApi): NsActivationContext & { cwd: string } {
	return {
		cwd: ctx.cwd,
		git: createNsGitGateway(ctx),
		files: new RealActivationFilesGateway(),
		declaredExtensions: new RealDeclaredExtensionsGateway(),
		artifacts: new RealArtifactActivationGateway(),
	};
}

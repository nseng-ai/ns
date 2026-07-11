import { createNsGitGateway } from "@nseng-ai/capability-kit/git";
import { createRealExtensionAcquisitionGateway } from "@nseng-ai/kernel/extensions/acquisition";
import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";

import type { NsActivationContext } from "../activation-context.ts";
import { RealExtensionInstallAcquisitionGateway } from "../extension-acquisition.ts";
import type { ExtensionInstallContext } from "../install-extension.ts";
import { RealActivationFilesGateway } from "../real-activation-files.ts";
import { RealArtifactActivationGateway } from "../real-artifact-activation.ts";
import { RealDeclaredExtensionsGateway } from "../declared-extensions.ts";

export function createNsInitContext(
	ctx: NsExtensionApi,
): NsActivationContext & ExtensionInstallContext & { cwd: string } {
	return {
		cwd: ctx.cwd,
		git: createNsGitGateway(ctx),
		acquisition: new RealExtensionInstallAcquisitionGateway(
			createRealExtensionAcquisitionGateway((command, args, options) =>
				ctx.exec(command, args, { cwd: options.cwd }),
			),
		),
		files: new RealActivationFilesGateway(),
		declaredExtensions: new RealDeclaredExtensionsGateway(),
		artifacts: new RealArtifactActivationGateway(),
	};
}

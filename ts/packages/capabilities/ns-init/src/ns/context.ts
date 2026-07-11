import { createNsGitGateway } from "@nseng-ai/capability-kit";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
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
			createRealExtensionAcquisitionGateway(extensionApiCommandExecApi(ctx)),
		),
		files: new RealActivationFilesGateway(),
		declaredExtensions: new RealDeclaredExtensionsGateway(),
		artifacts: new RealArtifactActivationGateway(),
	};
}

/**
 * Adapts the extension SDK's `NsExtensionApi.exec` into a `CommandExecApi` for gateways that
 * accept the generic exec seam. `NsExecOptions` only supports a subset of `ExecOptions`
 * (no `env`, `signal`, or `terminationKillGraceMs`), so only the fields the host can honor are
 * forwarded; `timeout` is translated to the host's `timeoutMs` name.
 */
function extensionApiCommandExecApi(ctx: NsExtensionApi): CommandExecApi {
	return {
		exec(command, args, options) {
			return ctx.exec(command, args, {
				...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
				...(options?.stdin === undefined ? {} : { stdin: options.stdin }),
				...(options?.onStdout === undefined ? {} : { onStdout: options.onStdout }),
				...(options?.onStderr === undefined ? {} : { onStderr: options.onStderr }),
				...(options?.timeout === undefined ? {} : { timeoutMs: options.timeout }),
			});
		},
	};
}

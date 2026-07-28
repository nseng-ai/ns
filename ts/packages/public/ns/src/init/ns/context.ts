import { configureNsGitGateway, createNsGitGateway } from "@nseng-ai/extension-kit";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import type { GitGateway, GitTrunkBranchResult } from "@nseng-ai/foundation/git";
import { createRealExtensionAcquisitionGateway } from "@nseng-ai/sdk/extensions/acquisition";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { NsActivationContext } from "../activation-context.ts";
import {
	RealExtensionInstallAcquisitionGateway,
	RealExtensionUninstallAcquisitionGateway,
	RealExtensionUpdateAcquisitionGateway,
} from "../extension-acquisition.ts";
import type { ExtensionInstallContext } from "../install-extension.ts";
import type { ExtensionListContext } from "../list-extensions.ts";
import type { ExtensionUninstallContext } from "../uninstall-extension.ts";
import type { ExtensionUpdateContext } from "../update-extension.ts";
import { RealActivationFilesGateway } from "../real-activation-files.ts";
import { RealArtifactActivationGateway } from "../real-artifact-activation.ts";
import { RealArtifactProvisioningStatusGateway } from "../real-artifact-provisioning-status.ts";
import { RealDeclaredExtensionsGateway } from "../declared-extensions.ts";

export async function createNsInitContext(
	ctx: NsExtensionApi,
): Promise<
	NsActivationContext &
		ExtensionInstallContext &
		ExtensionListContext &
		ExtensionUninstallContext &
		ExtensionUpdateContext & { cwd: string }
> {
	const acquisition = createRealExtensionAcquisitionGateway(extensionApiCommandExecApi(ctx));
	return {
		cwd: ctx.cwd,
		git: createDeferredNsGitGateway(ctx),
		installAcquisition: new RealExtensionInstallAcquisitionGateway(acquisition),
		uninstallAcquisition: new RealExtensionUninstallAcquisitionGateway(acquisition),
		updateAcquisition: new RealExtensionUpdateAcquisitionGateway(acquisition),
		files: new RealActivationFilesGateway(),
		declaredExtensions: new RealDeclaredExtensionsGateway(),
		artifacts: new RealArtifactActivationGateway(),
		artifactProvisioningStatus: new RealArtifactProvisioningStatusGateway(),
		...(ctx.outputFormat === "human"
			? { lifecycleTrace: { emit: (line: string) => ctx.commandIo.phase(line) } }
			: {}),
	};
}

function createDeferredNsGitGateway(ctx: NsExtensionApi): GitGateway {
	const unconfiguredGit = createNsGitGateway(ctx);
	let configuredGit: Promise<GitGateway | GitTrunkBranchResult> | undefined;
	return new Proxy(unconfiguredGit, {
		get(target, property) {
			if (property === "trunkBranch") {
				return async (): Promise<GitTrunkBranchResult> => {
					configuredGit ??= configureNsGitGateway(ctx).then((result) =>
						result.ok
							? result.value
							: {
									type: "command-failure" as const,
									operation: "read-cached-remote-head" as const,
									reason: "failed" as const,
									error: result.error,
								},
					);
					const configured = await configuredGit;
					if (!("trunkBranch" in configured)) return configured;
					return configured.trunkBranch({ cwd: ctx.cwd });
				};
			}
			const value: unknown = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
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

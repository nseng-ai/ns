import { createNsGitGateway } from "@nseng-ai/extension-kit";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { mergeXdgHomeEnv, resolveNsXdgPath } from "@nseng-ai/foundation/xdg-path";
import {
	createRealExtensionAcquisitionGateway,
	userManagedNpmStorage,
} from "@nseng-ai/sdk/extensions/acquisition";
import { managedNpmPackagePaths } from "@nseng-ai/sdk/project-config";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { NsActivationContext } from "../activation-context.ts";
import {
	RealExtensionInstallAcquisitionGateway,
	RealExtensionUninstallAcquisitionGateway,
	RealExtensionUpdateAcquisitionGateway,
} from "../extension-acquisition.ts";
import { RealUserNpmUpdateAcquisitionGateway } from "../user-npm-update-acquisition.ts";
import type { ExtensionInstallContext } from "../install-extension.ts";
import type { ExtensionListContext } from "../list-extensions.ts";
import type { ExtensionUninstallContext } from "../uninstall-extension.ts";
import type { ExtensionUpdateContext } from "../update-extension.ts";
import { RealActivationFilesGateway } from "../real-activation-files.ts";
import { RealArtifactActivationGateway } from "../real-artifact-activation.ts";
import { RealArtifactProvisioningStatusGateway } from "../real-artifact-provisioning-status.ts";
import {
	RealDeclaredExtensionsGateway,
	RealUserExtensionAvailabilityGateway,
} from "../declared-extensions.ts";
import { loadPreinstalledNsCommandSources } from "../../cli/preinstalled-command-catalog.ts";
import { RealUserExtensionConfigGateway } from "../real-user-extension-config.ts";
import { RealUserArtifactActivationGateway } from "../real-user-artifact-activation.ts";

export function createNsInitContext(
	ctx: NsExtensionApi,
): NsActivationContext &
	ExtensionInstallContext &
	ExtensionListContext &
	ExtensionUninstallContext &
	ExtensionUpdateContext & { cwd: string } {
	const acquisition = createRealExtensionAcquisitionGateway(extensionApiCommandExecApi(ctx));
	const xdgEnv = mergeXdgHomeEnv({
		baseEnv: {},
		env: ctx.env,
		...optionalEntry("xdgHomeDir", ctx.homeDir),
	});
	const extensionsDataRoot = resolveNsXdgPath({
		kind: "data",
		env: xdgEnv,
		segments: ["extensions"],
	});
	const userStorage = extensionsDataRoot.ok
		? { type: "available" as const, storage: userManagedNpmStorage(extensionsDataRoot.value) }
		: {
				type: "unavailable" as const,
				diagnostic: {
					code: "user-managed-npm-storage-unavailable" as const,
					message: extensionsDataRoot.error.message,
				},
			};
	return {
		cwd: ctx.cwd,
		env: { ...ctx.env },
		git: createNsGitGateway(ctx),
		installAcquisition: new RealExtensionInstallAcquisitionGateway(acquisition),
		uninstallAcquisition: new RealExtensionUninstallAcquisitionGateway(acquisition),
		updateAcquisition: new RealExtensionUpdateAcquisitionGateway(acquisition),
		userNpmUpdateAcquisition: new RealUserNpmUpdateAcquisitionGateway(acquisition),
		files: new RealActivationFilesGateway(),
		declaredExtensions: new RealDeclaredExtensionsGateway(),
		userExtensionAvailability: new RealUserExtensionAvailabilityGateway(
			loadPreinstalledNsCommandSources,
			(packageName) =>
				userStorage.type === "available"
					? managedNpmPackagePaths(userStorage.storage, packageName).packageRoot
					: undefined,
		),
		userManagedNpmStorage: userStorage,
		userExtensionConfig: new RealUserExtensionConfigGateway({
			env: ctx.env,
			...(ctx.homeDir === undefined ? {} : { homeDir: ctx.homeDir }),
		}),
		userArtifacts: new RealUserArtifactActivationGateway({
			env: ctx.env,
			...(ctx.homeDir === undefined ? {} : { homeDir: ctx.homeDir }),
		}),
		artifacts: new RealArtifactActivationGateway(),
		artifactProvisioningStatus: new RealArtifactProvisioningStatusGateway(),
		installedExtensionPackages: {
			list: () =>
				(ctx.installedExtensionPackageNames ?? []).map((packageName) => ({ packageName })),
		},
		...(ctx.outputFormat === "human"
			? { lifecycleTrace: { emit: (line: string) => ctx.commandIo.phase(line) } }
			: {}),
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

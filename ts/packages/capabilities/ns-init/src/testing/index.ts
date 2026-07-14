import type { LifecycleTraceSink } from "../lifecycle-observability.ts";

export type {
	ActivationFileOperation,
	InMemoryActivationFilesState,
} from "../fake-activation-files.ts";
export { InMemoryActivationFilesGateway } from "../fake-activation-files.ts";
export type { InMemoryArtifactActivationState } from "../fake-artifact-activation.ts";
export { InMemoryArtifactActivationGateway } from "../fake-artifact-activation.ts";
export type { InMemoryArtifactProvisioningStatusState } from "../fake-artifact-provisioning-status.ts";
export { InMemoryArtifactProvisioningStatusGateway } from "../fake-artifact-provisioning-status.ts";
export type { InMemoryDeclaredExtensionsState } from "../fake-declared-extensions.ts";
export { InMemoryDeclaredExtensionsGateway } from "../fake-declared-extensions.ts";
export type {
	InMemoryExtensionInstallAcquisitionState,
	InMemoryExtensionUninstallAcquisitionState,
	InMemoryExtensionUpdateAcquisitionState,
} from "../extension-acquisition.ts";
export {
	InMemoryExtensionInstallAcquisitionGateway,
	InMemoryExtensionUninstallAcquisitionGateway,
	InMemoryExtensionUpdateAcquisitionGateway,
} from "../extension-acquisition.ts";
export type { LifecycleTraceSink } from "../lifecycle-observability.ts";

export class CollectingLifecycleTraceSink implements LifecycleTraceSink {
	private readonly lines: string[] = [];

	emit(line: string): void {
		this.lines.push(line);
	}

	collectedLines(): readonly string[] {
		return [...this.lines];
	}
}

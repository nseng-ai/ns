import type {
	InstallationVerificationResult,
	LocalStackInventoryResult,
	RemoteStackInventoryResult,
} from "../types.ts";

export interface GhStackInstallationGateway {
	verifyInstallation(): Promise<InstallationVerificationResult>;
}

export interface GhStackLocalInventoryGateway {
	loadLocalStacks(): Promise<LocalStackInventoryResult>;
}

export interface GhStackRemoteInventoryGateway {
	loadRemoteStacks(): Promise<RemoteStackInventoryResult>;
}

export interface GhStackListContext {
	readonly installation: GhStackInstallationGateway;
	readonly local: GhStackLocalInventoryGateway;
	readonly remote: GhStackRemoteInventoryGateway;
}

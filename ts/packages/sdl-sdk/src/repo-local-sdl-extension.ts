import type { SdlCommand } from "./command.ts";

export interface RepoLocalSdlExtensionCommandDescriptor {
	readonly command: SdlCommand;
	readonly manifestEntry: string;
	readonly packageExport: string;
	readonly manifestPath?: readonly string[];
	readonly manifestName?: string;
}

export interface RepoLocalSdlExtensionDescriptor {
	readonly group: string;
	readonly description: string;
	readonly commands: readonly RepoLocalSdlExtensionCommandDescriptor[];
}

export function defineRepoLocalSdlExtensionDescriptor(
	descriptor: RepoLocalSdlExtensionDescriptor,
): RepoLocalSdlExtensionDescriptor {
	return descriptor;
}

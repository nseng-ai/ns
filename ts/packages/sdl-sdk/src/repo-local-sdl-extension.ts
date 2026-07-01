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

export interface RepoLocalSdlCommandDescriptorOptions {
	readonly command: SdlCommand;
	readonly packageExportPrefix: string;
	readonly manifestPath?: readonly string[];
	readonly manifestName?: string;
}

export function repoLocalSdlCommandDescriptor(
	options: RepoLocalSdlCommandDescriptorOptions,
): RepoLocalSdlExtensionCommandDescriptor {
	const manifestName = options.manifestName ?? options.command.name;
	return {
		command: options.command,
		...(options.manifestName === undefined ? {} : { manifestName }),
		...(options.manifestPath === undefined ? {} : { manifestPath: options.manifestPath }),
		manifestEntry: `./src/commands/${manifestName}.ts`,
		packageExport: `${options.packageExportPrefix}/${manifestName}`,
	};
}

export function defineRepoLocalSdlExtensionDescriptor(
	descriptor: RepoLocalSdlExtensionDescriptor,
): RepoLocalSdlExtensionDescriptor {
	return descriptor;
}

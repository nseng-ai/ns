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
}

export function repoLocalSdlCommandDescriptor(
	options: RepoLocalSdlCommandDescriptorOptions,
): RepoLocalSdlExtensionCommandDescriptor {
	const manifestName = manifestNameForCommandDescriptor(options);
	return {
		command: options.command,
		...(options.manifestPath === undefined
			? {}
			: { manifestName, manifestPath: options.manifestPath }),
		manifestEntry: `./src/commands/${manifestName}.ts`,
		packageExport: `${options.packageExportPrefix}/${manifestName}`,
	};
}

export function defineRepoLocalSdlExtensionDescriptor(
	descriptor: RepoLocalSdlExtensionDescriptor,
): RepoLocalSdlExtensionDescriptor {
	return descriptor;
}

function manifestNameForCommandDescriptor(options: RepoLocalSdlCommandDescriptorOptions): string {
	return options.manifestPath?.join("-") ?? options.command.name;
}

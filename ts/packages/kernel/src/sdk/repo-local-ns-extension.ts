import type { NsCommand } from "./command.ts";

export interface RepoLocalNsExtensionCommandDescriptor {
	readonly command: NsCommand;
	readonly manifestEntry: string;
	readonly packageExport: string;
	readonly manifestPath?: readonly string[];
	readonly manifestName?: string;
}

export interface RepoLocalNsExtensionDescriptor {
	readonly group: string;
	readonly description: string;
	readonly commands: readonly RepoLocalNsExtensionCommandDescriptor[];
}

export interface RepoLocalNsCommandDescriptorOptions {
	readonly command: NsCommand;
	readonly packageExportPrefix: string;
	readonly manifestPath?: readonly string[];
	readonly manifestName?: string;
}

export function repoLocalNsCommandDescriptor(
	options: RepoLocalNsCommandDescriptorOptions,
): RepoLocalNsExtensionCommandDescriptor {
	const manifestName = options.manifestName ?? options.command.name;
	return {
		command: options.command,
		...(options.manifestName === undefined ? {} : { manifestName }),
		...(options.manifestPath === undefined ? {} : { manifestPath: options.manifestPath }),
		manifestEntry: `./src/commands/${manifestName}.ts`,
		packageExport: `${options.packageExportPrefix}/${manifestName}`,
	};
}

export function defineRepoLocalNsExtensionDescriptor(
	descriptor: RepoLocalNsExtensionDescriptor,
): RepoLocalNsExtensionDescriptor {
	return descriptor;
}

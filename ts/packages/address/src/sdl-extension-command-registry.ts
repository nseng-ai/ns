import { EXEC_OPERATIONS } from "./exec-commands.ts";

interface RepoLocalSdlExtensionCommandRegistryEntry {
	readonly manifestName: string;
	readonly manifestDescription: string;
	readonly manifestEntry: string;
	readonly packageExport: string;
}

export const addressSdlExtensionCommands = EXEC_OPERATIONS.map((operation) => ({
	manifestName: `exec-${operation.name}`,
	manifestDescription: `Run Address ${operation.name} operation.`,
	manifestEntry: "./src/commands/exec.ts",
	packageExport: "@sdl/address/sdl-command",
})) satisfies readonly RepoLocalSdlExtensionCommandRegistryEntry[];

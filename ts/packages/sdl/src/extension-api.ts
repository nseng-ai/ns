import type { SdlCommand } from "./sdk.ts";

export type ExtensionSourceLevel = "built-in" | "global" | "project";

export interface ExtensionSourceInfo {
	level: ExtensionSourceLevel;
	label: string;
	path?: string | undefined;
}

export interface ExtensionAPI {
	registerCommand(command: SdlCommand): void;
}

export type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>;

export interface ExtensionCommandContribution {
	name: string | undefined;
	command: unknown;
	source: ExtensionSourceInfo;
}

export interface CreatedExtensionApi {
	api: ExtensionAPI;
	contributions: readonly ExtensionCommandContribution[];
}

export function createExtensionApi(source: ExtensionSourceInfo): CreatedExtensionApi {
	const contributions: ExtensionCommandContribution[] = [];
	return {
		api: {
			registerCommand(command) {
				contributions.push({
					name: readCommandName(command),
					command,
					source,
				});
			},
		},
		contributions,
	};
}

function readCommandName(command: unknown): string | undefined {
	if (typeof command !== "object" || command === null || Array.isArray(command)) return undefined;
	const candidate = command as { readonly name?: unknown };
	return typeof candidate.name === "string" ? candidate.name : undefined;
}

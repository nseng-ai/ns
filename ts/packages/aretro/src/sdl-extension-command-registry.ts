interface RepoLocalSdlExtensionCommandRegistryEntry {
	readonly manifestName: string;
	readonly manifestDescription: string;
	readonly manifestEntry: string;
	readonly packageExport: string;
}

export const aretroSdlExtensionCommands = [
	{
		manifestName: "exec-collect-evidence",
		manifestDescription: "Collect compact session evidence for a branch retrospective.",
		manifestEntry: "./src/commands/exec-collect-evidence.ts",
		packageExport: "@sdl/aretro/sdl/commands/exec-collect-evidence",
	},
	{
		manifestName: "exec-read-evidence-detail",
		manifestDescription: "Read Aretro evidence detail from a payload pointer.",
		manifestEntry: "./src/commands/exec-read-evidence-detail.ts",
		packageExport: "@sdl/aretro/sdl/commands/exec-read-evidence-detail",
	},
] as const satisfies readonly RepoLocalSdlExtensionCommandRegistryEntry[];

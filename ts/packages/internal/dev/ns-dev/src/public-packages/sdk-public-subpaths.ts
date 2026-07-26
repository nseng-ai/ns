export interface SdkFoldEntry {
	readonly name: string;
	readonly sourceExport: string;
	readonly nsExport: string;
	readonly sourcePath: string;
}

export const sdkFoldEntries: readonly SdkFoldEntry[] = [
	{ name: "sdk", sourceExport: ".", nsExport: "./sdk", sourcePath: "sdk/index" },
	{ name: "cli", sourceExport: "./cli", nsExport: "./sdk/cli", sourcePath: "cli/index" },
	{
		name: "command-io",
		sourceExport: "./command-io",
		nsExport: "./sdk/command-io",
		sourcePath: "runtime/command-io",
	},
	{
		name: "context",
		sourceExport: "./context",
		nsExport: "./sdk/context",
		sourcePath: "cli/context",
	},
];

export function sdkPublicExports(): Record<string, string> {
	return Object.fromEntries(
		sdkFoldEntries.map((entry) => [entry.sourceExport, `./src/${entry.sourcePath}.ts`]),
	);
}

export function descriptorPackageJson(options: {
	name: string;
	version?: string;
	exportTarget?: unknown;
}): string {
	return `${JSON.stringify(
		{
			name: options.name,
			...(options.version === undefined ? {} : { version: options.version }),
			exports: { "./ns-extension": options.exportTarget ?? "./src/ns/extension.ts" },
		},
		null,
		2,
	)}\n`;
}

export function descriptorExtensionSource(options: {
	description: string;
	bundledArtifacts: readonly unknown[];
}): string {
	return `import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	description: ${JSON.stringify(options.description)},
	bundledArtifacts: ${JSON.stringify(options.bundledArtifacts)},
});
`;
}

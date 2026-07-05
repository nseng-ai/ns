import { z } from "./schema.ts";

export const nsExtensionManifestCommandSchema = z.looseObject({
	name: z.string().optional(),
	path: z.array(z.string()).optional(),
	group: z.string().optional(),
	description: z.string().optional(),
	fullDescription: z.string().optional(),
	entry: z.string().optional(),
});

export const nsExtensionManifestSchema = z.looseObject({
	description: z.string().optional(),
	group: z.string().optional(),
	commands: z.array(z.unknown()).optional(),
});

export const nsExtensionPackageManifestSchema = z.looseObject({
	description: z.string().optional(),
	ns: nsExtensionManifestSchema.optional(),
});

export type NsExtensionManifestCommand = z.infer<typeof nsExtensionManifestCommandSchema>;
export type NsExtensionManifest = z.infer<typeof nsExtensionManifestSchema>;
export type NsExtensionPackageManifest = z.infer<typeof nsExtensionPackageManifestSchema>;

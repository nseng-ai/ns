import { z } from "./schema.ts";

export const sdlExtensionManifestCommandSchema = z.looseObject({
	name: z.string().optional(),
	path: z.array(z.string()).optional(),
	group: z.string().optional(),
	description: z.string().optional(),
	fullDescription: z.string().optional(),
	entry: z.string().optional(),
});

export const sdlExtensionManifestSchema = z.looseObject({
	description: z.string().optional(),
	group: z.string().optional(),
	commands: z.array(z.unknown()).optional(),
});

export const sdlExtensionPackageManifestSchema = z.looseObject({
	description: z.string().optional(),
	sdl: sdlExtensionManifestSchema.optional(),
});

export type SdlExtensionManifestCommand = z.infer<typeof sdlExtensionManifestCommandSchema>;
export type SdlExtensionManifest = z.infer<typeof sdlExtensionManifestSchema>;
export type SdlExtensionPackageManifest = z.infer<typeof sdlExtensionPackageManifestSchema>;

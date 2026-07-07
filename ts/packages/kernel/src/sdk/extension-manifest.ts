import { z } from "./schema.ts";

export const nsExtensionPointAcceptsValues = ["hook", "prompt"] as const;
export const nsExtensionPointSemanticsValues = ["additive", "override"] as const;

export const nsExtensionManifestCommandSchema = z.looseObject({
	name: z.string().optional(),
	path: z.array(z.string()).optional(),
	group: z.string().optional(),
	description: z.string().optional(),
	fullDescription: z.string().optional(),
	entry: z.string().optional(),
});

export const nsExtensionManifestPointSchema = z.looseObject({
	path: z.array(z.string()).optional(),
	accepts: z.enum(nsExtensionPointAcceptsValues).optional(),
	semantics: z.enum(nsExtensionPointSemanticsValues).optional(),
	default: z.string().optional(),
	description: z.string().optional(),
});

export const nsExtensionManifestSchema = z.looseObject({
	description: z.string().optional(),
	group: z.string().optional(),
	commands: z.array(z.unknown()).optional(),
	points: z.array(z.unknown()).optional(),
});

export const nsExtensionPackageManifestSchema = z.looseObject({
	description: z.string().optional(),
	ns: nsExtensionManifestSchema.optional(),
});

export type NsExtensionManifestCommand = z.infer<typeof nsExtensionManifestCommandSchema>;
export type NsExtensionManifestPoint = z.infer<typeof nsExtensionManifestPointSchema>;
export type NsExtensionManifest = z.infer<typeof nsExtensionManifestSchema>;
export type NsExtensionPackageManifest = z.infer<typeof nsExtensionPackageManifestSchema>;

import { z } from "zod";

import packageManifest from "../../package.json" with { type: "json" };

const canonicalNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const portableRelativePathSchema = z
	.string()
	.min(1)
	.refine(
		(path) =>
			!path.startsWith("/") &&
			!/^[A-Za-z]:/u.test(path) &&
			!path.includes("\\") &&
			path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
		"must be a portable relative path without traversal",
	);

const publishExtraSchema = z.strictObject({
	kind: z.literal("skill"),
	name: z.string().regex(canonicalNamePattern),
	sourcePath: portableRelativePathSchema,
	publishPath: portableRelativePathSchema,
});

const packagePublishMetadataSchema = z.object({
	ns: z.object({
		publishExtras: z.array(publishExtraSchema).superRefine((entries, context) => {
			const names = new Set<string>();
			const destinations = new Set<string>();
			for (const [index, entry] of entries.entries()) {
				if (names.has(entry.name)) {
					context.addIssue({ code: "custom", message: "duplicate name", path: [index, "name"] });
				}
				if (destinations.has(entry.publishPath)) {
					context.addIssue({
						code: "custom",
						message: "duplicate publish path",
						path: [index, "publishPath"],
					});
				}
				names.add(entry.name);
				destinations.add(entry.publishPath);
			}
		}),
	}),
});

export function deriveObjectiveBundledArtifacts(rawManifest: unknown) {
	const metadata = packagePublishMetadataSchema.parse(rawManifest);
	return metadata.ns.publishExtras.map((entry) => ({
		kind: entry.kind,
		name: entry.name,
		path: entry.publishPath,
	}));
}

export const objectiveBundledArtifacts = deriveObjectiveBundledArtifacts(packageManifest);

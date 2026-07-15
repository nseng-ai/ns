export interface PublishExtraManifestEntry {
	readonly kind: "skill";
	readonly name: string;
	readonly sourcePath: string;
	readonly publishPath: string;
}

export interface ValidatedPublishExtra extends PublishExtraManifestEntry {
	readonly sourceAbsolutePath: string;
	readonly publishAbsolutePath: string;
}

export function validatePublishExtras(options: {
	readonly manifest: unknown;
	readonly sourceRoot: string;
	readonly publishRoot: string;
}): Promise<ValidatedPublishExtra[]>;
export function copyPublishExtras(extras: readonly ValidatedPublishExtra[]): Promise<void>;
export function filesWithPublishExtras(
	files: readonly string[],
	extras: readonly ValidatedPublishExtra[],
): string[];
export function publishExtrasManifestMetadata(extras: readonly ValidatedPublishExtra[]): {
	readonly ns?: { readonly publishExtras: readonly PublishExtraManifestEntry[] };
};

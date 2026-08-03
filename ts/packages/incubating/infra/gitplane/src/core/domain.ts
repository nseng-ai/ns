import type { ArtifactClassification, ArtifactId } from "./artifact.ts";
import type { MaterializationStoreGateway } from "./gateways.ts";
import type { ContentDigest } from "./identity.ts";

export type ArtifactEntryKind = "regular-file" | "directory" | "symlink" | "submodule" | "special";
export type ArtifactEntry =
	| { readonly path: string; readonly kind: "regular-file"; readonly bytes: Uint8Array }
	| { readonly path: string; readonly kind: Exclude<ArtifactEntryKind, "regular-file"> };
export interface ArtifactCandidate {
	readonly path: string;
	readonly entries: readonly ArtifactEntry[];
}
export interface ArtifactSnapshot {
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly path: string;
	readonly entries: readonly Extract<ArtifactEntry, { readonly kind: "regular-file" }>[];
	readonly envelope: Readonly<Record<string, unknown>>;
	readonly classification: ArtifactClassification;
}
export interface ArtifactCorpusEntry {
	readonly snapshot: ArtifactSnapshot;
	readonly digest: ContentDigest;
}
export interface ArtifactCorpus {
	readonly artifacts: readonly ArtifactCorpusEntry[];
}
export interface ProjectionField {
	readonly target: string;
	readonly mode?: "json";
}
export interface TargetProjectionField {
	readonly column: string;
	readonly mode: "scalar" | "json";
	readonly value: unknown;
}
export interface ArtifactSchemaRegistration {
	readonly fields: Readonly<Record<string, ProjectionField>>;
	readonly clearFields?: readonly string[];
}
export interface ArtifactKindRegistration {
	readonly apiVersion: string;
	readonly kind: string;
	readonly schemaVersions: Readonly<Record<number, ArtifactSchemaRegistration>>;
	readonly transitions: readonly { readonly from: number; readonly to: number }[];
	readonly target: TargetMapping;
}
export interface TargetMapping {
	readonly table: string;
	readonly lineage: {
		readonly sourceId: string;
		readonly artifactId: string;
		readonly revisionId: string;
		readonly path: string;
		readonly deleted: string;
		readonly deletedAtCommit: string;
	};
}
export interface Clock {
	now(): Date;
}
export type StoreAccess = "read-only" | "read-write";
export interface GitplaneContext {
	readonly clock: Clock;
	readonly configDirectory: string;
}
export type GitplaneStoreFactory = (
	context: GitplaneContext,
	options: { readonly access: StoreAccess },
) => MaterializationStoreGateway;
export interface GitplaneConfig {
	readonly source: { readonly id: string; readonly artifactRoot: string };
	readonly store: GitplaneStoreFactory;
	readonly kinds?: readonly ArtifactKindRegistration[];
}
export function defineGitplaneConfig(config: GitplaneConfig): GitplaneConfig {
	return config;
}
export function defineArtifactKind(
	registration: ArtifactKindRegistration,
): ArtifactKindRegistration {
	return registration;
}

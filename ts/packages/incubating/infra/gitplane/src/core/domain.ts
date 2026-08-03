import type { ArtifactClassification, ArtifactId } from "./artifact.ts";
import type { MaterializationStoreGateway } from "./gateways.ts";

export type ArtifactEntryKind = "regular-file" | "symlink" | "submodule" | "directory" | "special";
export interface ArtifactEntry {
	readonly path: string;
	readonly kind: ArtifactEntryKind;
	readonly bytes: Uint8Array;
	readonly mode?: string;
}
export interface ArtifactSnapshot {
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly path: string;
	readonly entries: readonly ArtifactEntry[];
	readonly envelope: Readonly<Record<string, unknown>>;
	readonly classification: ArtifactClassification;
}
export type ClassifiedArtifactSnapshot = ArtifactSnapshot & {
	readonly classification: Extract<ArtifactClassification, { readonly state: "classified" }>;
};
export interface ValidationFinding {
	readonly code: string;
	readonly severity: "error" | "warning";
	readonly summary: string;
	readonly artifactPath?: string;
	readonly artifactId?: ArtifactId;
	readonly relativePath?: string;
	readonly jsonPointer?: string;
}
export type ArtifactValidator = (
	snapshot: ClassifiedArtifactSnapshot,
) => readonly ValidationFinding[] | Promise<readonly ValidationFinding[]>;
export interface ProjectionField {
	readonly target: string;
	readonly mode?: "json";
}
export interface ArtifactSchemaRegistration {
	readonly validate: ArtifactValidator;
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
export interface GitplaneContext {
	readonly clock: Clock;
}
export interface GitplaneConfig {
	readonly source: { readonly id: string; readonly artifactRoot: string };
	readonly store: (context: GitplaneContext) => MaterializationStoreGateway;
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

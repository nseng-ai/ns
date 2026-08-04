import { z } from "zod";
import { isCanonicalUlid } from "./vendored/ulid.ts";

export const ARTIFACT_MARKER_NAME = "gitplane-artifact.json";

export const artifactIdSchema = z.string().refine(isCanonicalUlid).brand<"ArtifactId">();
export type ArtifactId = z.infer<typeof artifactIdSchema>;

export type ArtifactIdParseResult =
	| { readonly ok: true; readonly artifactId: ArtifactId }
	| { readonly ok: false; readonly code: "invalid-artifact-id"; readonly message: string };

export function parseArtifactId(value: string): ArtifactIdParseResult {
	const parsed = artifactIdSchema.safeParse(value);
	return parsed.success
		? { ok: true, artifactId: parsed.data }
		: {
				ok: false,
				code: "invalid-artifact-id",
				message: "Artifact ID must be a canonical lowercase ULID.",
			};
}

export const artifactClassificationSchema = z.discriminatedUnion("state", [
	z.object({ state: z.literal("generic") }).strict(),
	z
		.object({
			state: z.literal("classified"),
			apiVersion: z.string().min(1),
			kind: z.string().min(1),
			schemaVersion: z.number().int().positive(),
		})
		.strict(),
]);
export type ArtifactClassification = z.infer<typeof artifactClassificationSchema>;

export interface ArtifactMarker {
	readonly gpId: ArtifactId;
	readonly classification: ArtifactClassification;
	readonly envelope: Readonly<Record<string, unknown>>;
}

const markerEnvelopeSchema = z.looseObject({
	gpId: artifactIdSchema,
	gpApiVersion: z.string().min(1).optional(),
	gpKind: z.string().min(1).optional(),
	gpSchemaVersion: z.number().int().positive().optional(),
});

export type MarkerParseResult =
	| { readonly ok: true; readonly marker: ArtifactMarker }
	| { readonly ok: false; readonly code: "invalid-marker"; readonly message: string };

export function parseArtifactMarker(value: unknown): MarkerParseResult {
	const parsed = markerEnvelopeSchema.safeParse(value);
	if (!parsed.success)
		return {
			ok: false,
			code: "invalid-marker",
			message: parsed.error.issues[0]?.message ?? "Invalid artifact marker.",
		};
	const envelope = parsed.data;
	const { gpApiVersion, gpKind, gpSchemaVersion } = envelope;
	let classification: ArtifactClassification;
	if (gpApiVersion === undefined && gpKind === undefined && gpSchemaVersion === undefined)
		classification = { state: "generic" };
	else if (gpApiVersion !== undefined && gpKind !== undefined && gpSchemaVersion !== undefined)
		classification = {
			state: "classified",
			apiVersion: gpApiVersion,
			kind: gpKind,
			schemaVersion: gpSchemaVersion,
		};
	else
		return {
			ok: false,
			code: "invalid-marker",
			message: "Classification fields must be supplied all-or-none.",
		};
	return { ok: true, marker: { gpId: envelope.gpId, classification, envelope: { ...envelope } } };
}

export function serializeArtifactMarker(options: {
	readonly artifactId: ArtifactId;
	readonly classification: ArtifactClassification;
}): string {
	const marker =
		options.classification.state === "generic"
			? { gpId: options.artifactId }
			: {
					gpApiVersion: options.classification.apiVersion,
					gpKind: options.classification.kind,
					gpSchemaVersion: options.classification.schemaVersion,
					gpId: options.artifactId,
				};
	return `${JSON.stringify(marker, null, 2)}\n`;
}

export type ClassificationTransitionResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: "classification-removed" | "classification-changed" };
export function validateClassificationTransition(
	previous: ArtifactClassification,
	next: ArtifactClassification,
): ClassificationTransitionResult {
	if (previous.state === "generic") return { ok: true };
	if (next.state === "generic") return { ok: false, code: "classification-removed" };
	return previous.apiVersion === next.apiVersion && previous.kind === next.kind
		? { ok: true }
		: { ok: false, code: "classification-changed" };
}

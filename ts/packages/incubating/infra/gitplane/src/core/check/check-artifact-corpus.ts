import { parseArtifactId, type ArtifactClassification, type ArtifactId } from "../artifact.ts";
import type {
	ArtifactCandidate,
	ArtifactCorpusEntry,
	ArtifactKindRegistration,
	ArtifactSnapshot,
} from "../domain.ts";
import { digestArtifactContent } from "../identity.ts";
import type { CorpusCheckResult } from "./corpus.ts";
import { sortFindings, type Finding } from "./finding.ts";
import { duplicateArtifactIdFinding } from "./rules/duplicate-artifact-id.ts";
import { invalidArtifactIdFinding } from "./rules/invalid-artifact-id.ts";
import { invalidMarkerEnvelopeFinding } from "./rules/invalid-marker-envelope.ts";
import { invalidMarkerJsonFinding } from "./rules/invalid-marker-json.ts";
import { unknownArtifactKindFinding } from "./rules/unknown-artifact-kind.ts";
import { unknownSchemaVersionFinding } from "./rules/unknown-schema-version.ts";
import { unsupportedArtifactEntryFinding } from "./rules/unsupported-artifact-entry.ts";

interface ParsedCandidate {
	readonly artifactId?: ArtifactId;
	readonly path: string;
	readonly snapshot?: ArtifactSnapshot;
	readonly findings: readonly Finding[];
}

function parseCandidate(
	sourceId: string,
	candidate: ArtifactCandidate,
	kinds: readonly ArtifactKindRegistration[],
): ParsedCandidate {
	const findings: Finding[] = [];
	const marker = candidate.entries.find((entry) => entry.path === "gitplane-artifact.json");
	for (const entry of candidate.entries) {
		if (entry.kind !== "regular-file" && entry.kind !== "directory")
			findings.push(unsupportedArtifactEntryFinding(candidate.path, entry.path));
	}
	if (marker === undefined || marker.kind !== "regular-file")
		return { path: candidate.path, findings };

	let value: unknown;
	try {
		value = JSON.parse(Buffer.from(marker.bytes).toString("utf8"));
	} catch {
		return {
			path: candidate.path,
			findings: [...findings, invalidMarkerJsonFinding(candidate.path)],
		};
	}
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return {
			path: candidate.path,
			findings: [...findings, invalidMarkerJsonFinding(candidate.path)],
		};

	const envelope = value as Record<string, unknown>;
	const gpId = envelope.gpId;
	let artifactId: ArtifactId | undefined;
	let idValueValid = false;
	if (!("gpId" in envelope))
		findings.push(
			invalidMarkerEnvelopeFinding(candidate.path, "/gpId", "Artifact marker requires gpId."),
		);
	else if (typeof gpId !== "string")
		findings.push(invalidMarkerEnvelopeFinding(candidate.path, "/gpId", "gpId must be a string."));
	else {
		idValueValid = true;
		const parsed = parseArtifactId(gpId);
		if (parsed.ok) artifactId = parsed.artifactId;
		else findings.push(invalidArtifactIdFinding(candidate.path));
	}

	const classificationNames = ["gpApiVersion", "gpKind", "gpSchemaVersion"] as const;
	const present = classificationNames.filter((name) => name in envelope);
	if (present.length > 0 && present.length < classificationNames.length) {
		for (const name of classificationNames) {
			if (!(name in envelope))
				findings.push(
					invalidMarkerEnvelopeFinding(
						candidate.path,
						`/${name}`,
						`${name} is required when classifying an artifact.`,
					),
				);
		}
	}
	const apiVersionValid =
		typeof envelope.gpApiVersion === "string" && envelope.gpApiVersion.length > 0;
	const kindValid = typeof envelope.gpKind === "string" && envelope.gpKind.length > 0;
	const schemaVersionValid =
		typeof envelope.gpSchemaVersion === "number" &&
		Number.isInteger(envelope.gpSchemaVersion) &&
		envelope.gpSchemaVersion > 0;
	if ("gpApiVersion" in envelope && !apiVersionValid)
		findings.push(
			invalidMarkerEnvelopeFinding(
				candidate.path,
				"/gpApiVersion",
				"gpApiVersion must be a non-empty string.",
			),
		);
	if ("gpKind" in envelope && !kindValid)
		findings.push(
			invalidMarkerEnvelopeFinding(candidate.path, "/gpKind", "gpKind must be a non-empty string."),
		);
	if ("gpSchemaVersion" in envelope && !schemaVersionValid)
		findings.push(
			invalidMarkerEnvelopeFinding(
				candidate.path,
				"/gpSchemaVersion",
				"gpSchemaVersion must be a positive integer.",
			),
		);

	let classification: ArtifactClassification = { state: "generic" };
	if (present.length === 3 && apiVersionValid && kindValid && schemaVersionValid) {
		const apiVersion = String(envelope.gpApiVersion);
		const kind = String(envelope.gpKind);
		const schemaVersion = Number(envelope.gpSchemaVersion);
		classification = { state: "classified", apiVersion, kind, schemaVersion };
		if (artifactId !== undefined) {
			const registration = kinds.find(
				(item) => item.apiVersion === apiVersion && item.kind === kind,
			);
			if (registration === undefined)
				findings.push(unknownArtifactKindFinding(candidate.path, artifactId));
			else if (!(schemaVersion in registration.schemaVersions))
				findings.push(unknownSchemaVersionFinding(candidate.path, artifactId));
		}
	}

	const hasHardIssue = findings.some((finding) => finding.severity === "error");
	if (hasHardIssue || artifactId === undefined || !idValueValid)
		return { path: candidate.path, ...(artifactId === undefined ? {} : { artifactId }), findings };
	return {
		path: candidate.path,
		artifactId,
		findings,
		snapshot: {
			sourceId,
			artifactId,
			path: candidate.path,
			envelope: structuredClone(envelope),
			classification,
			entries: candidate.entries
				.filter(
					(entry): entry is Extract<typeof entry, { kind: "regular-file" }> =>
						entry.kind === "regular-file",
				)
				.map((entry) => ({ ...entry, bytes: new Uint8Array(entry.bytes) })),
		},
	};
}

export function checkArtifactCorpus(options: {
	readonly sourceId: string;
	readonly artifactCount: number;
	readonly candidates: readonly ArtifactCandidate[];
	readonly kinds?: readonly ArtifactKindRegistration[];
}): CorpusCheckResult {
	const parsed = options.candidates.map((candidate) =>
		parseCandidate(options.sourceId, candidate, options.kinds ?? []),
	);
	const findings = parsed.flatMap((item) => item.findings);
	const ids = new Map<string, { readonly artifactId: ArtifactId; readonly path: string }[]>();
	for (const item of parsed) {
		if (item.artifactId !== undefined)
			ids.set(item.artifactId, [
				...(ids.get(item.artifactId) ?? []),
				{ artifactId: item.artifactId, path: item.path },
			]);
	}
	for (const duplicates of ids.values()) {
		if (duplicates.length > 1) {
			const paths = duplicates.map((item) => item.path).sort();
			for (const item of duplicates)
				findings.push(duplicateArtifactIdFinding(item.path, item.artifactId, paths));
		}
	}
	const invalidPaths = new Set(findings.flatMap((item) => item.artifactPath ?? []));
	const artifacts: ArtifactCorpusEntry[] = [];
	for (const item of parsed) {
		if (item.snapshot === undefined || invalidPaths.has(item.path)) continue;
		const digest = digestArtifactContent(item.snapshot.entries);
		if (!digest.ok)
			return {
				type: "failed",
				failure: { code: "digest-precondition-failed", message: digest.message },
			};
		artifacts.push({ snapshot: item.snapshot, digest: digest.value });
	}
	const sorted = sortFindings(findings);
	return sorted.some((item) => item.severity === "error")
		? { type: "invalid", artifactCount: options.artifactCount, findings: sorted }
		: { type: "ready", corpus: { artifacts }, findings: sorted };
}

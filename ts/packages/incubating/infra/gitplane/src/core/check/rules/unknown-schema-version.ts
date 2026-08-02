import type { ArtifactId } from "../../artifact.ts";
import type { Finding } from "../finding.ts";
export function unknownSchemaVersionFinding(artifactPath: string, artifactId: ArtifactId): Finding {
	return {
		code: "unknown-schema-version",
		severity: "error",
		summary: "Artifact schema version is not declared.",
		artifactPath,
		artifactId,
		relativePath: "gitplane-artifact.json",
		jsonPointer: "/gpSchemaVersion",
	};
}

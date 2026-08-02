import type { Finding } from "../finding.ts";
export function invalidArtifactIdFinding(artifactPath: string): Finding {
	return {
		code: "invalid-artifact-id",
		severity: "error",
		summary: "Artifact ID must be a canonical lowercase ULID.",
		artifactPath,
		relativePath: "gitplane-artifact.json",
		jsonPointer: "/gpId",
	};
}

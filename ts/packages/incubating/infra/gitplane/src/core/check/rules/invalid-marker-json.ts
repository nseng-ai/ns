import type { Finding } from "../finding.ts";
export function invalidMarkerJsonFinding(artifactPath: string): Finding {
	return {
		code: "invalid-marker-json",
		severity: "error",
		summary: "Artifact marker must contain a JSON object.",
		artifactPath,
		relativePath: "gitplane-artifact.json",
	};
}

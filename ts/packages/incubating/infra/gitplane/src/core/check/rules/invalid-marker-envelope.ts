import type { Finding } from "../finding.ts";
export function invalidMarkerEnvelopeFinding(
	artifactPath: string,
	jsonPointer: string,
	summary: string,
): Finding {
	return {
		code: "invalid-marker-envelope",
		severity: "error",
		summary,
		artifactPath,
		relativePath: "gitplane-artifact.json",
		jsonPointer,
	};
}

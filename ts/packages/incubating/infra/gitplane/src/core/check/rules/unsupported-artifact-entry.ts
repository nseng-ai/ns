import type { Finding } from "../finding.ts";
export function unsupportedArtifactEntryFinding(
	artifactPath: string,
	relativePath: string,
): Finding {
	return {
		code: "unsupported-artifact-entry",
		severity: "error",
		summary: "Artifact entry kind is unsupported.",
		artifactPath,
		relativePath,
	};
}

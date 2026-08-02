import type { ArtifactId } from "../../artifact.ts";
import type { Finding } from "../finding.ts";
export function duplicateArtifactIdFinding(
	artifactPath: string,
	artifactId: ArtifactId,
	relatedArtifactPaths: readonly string[],
): Finding {
	return {
		code: "duplicate-artifact-id",
		severity: "error",
		summary: `Artifact ID ${artifactId} is shared by: ${[...relatedArtifactPaths].sort().join(", ")}`,
		artifactPath,
		artifactId,
		relativePath: "gitplane-artifact.json",
		jsonPointer: "/gpId",
		relatedArtifactPaths: [...relatedArtifactPaths].sort(),
	};
}

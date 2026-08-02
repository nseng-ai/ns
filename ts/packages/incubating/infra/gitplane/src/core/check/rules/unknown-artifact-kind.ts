import type { ArtifactId } from "../../artifact.ts";
import type { Finding } from "../finding.ts";
export function unknownArtifactKindFinding(artifactPath: string, artifactId: ArtifactId): Finding {
	return {
		code: "unknown-artifact-kind",
		severity: "error",
		summary: "Classified artifact kind is not registered.",
		artifactPath,
		artifactId,
		relativePath: "gitplane-artifact.json",
		jsonPointer: "/gpKind",
	};
}

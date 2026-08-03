import type { Finding } from "../finding.ts";
export function nestedArtifactFinding(options: {
	readonly artifactPath: string;
	readonly relativePath: string;
	readonly nestedArtifactPath: string;
}): Finding {
	return {
		code: "nested-artifact",
		severity: "error",
		summary: "Artifacts cannot be nested.",
		artifactPath: options.artifactPath,
		relativePath: options.relativePath,
		relatedArtifactPaths: [options.nestedArtifactPath],
	};
}

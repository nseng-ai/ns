import { z } from "zod";

export const FINDING_CODES = [
	"nested-artifact",
	"invalid-marker-json",
	"invalid-marker-envelope",
	"invalid-artifact-id",
	"duplicate-artifact-id",
	"unknown-artifact-kind",
	"unknown-schema-version",
	"unsupported-artifact-entry",
] as const;
export const findingSchema = z.object({
	code: z.enum(FINDING_CODES),
	severity: z.enum(["error", "warning"]),
	summary: z.string(),
	artifactPath: z.string().optional(),
	artifactId: z.string().optional(),
	relativePath: z.string().optional(),
	jsonPointer: z.string().optional(),
	relatedArtifactPaths: z.array(z.string()).optional(),
});
export type Finding = z.infer<typeof findingSchema>;
function compareOptional(left: string | undefined, right: string | undefined): number {
	if (left === undefined) return right === undefined ? 0 : -1;
	if (right === undefined) return 1;
	return left.localeCompare(right);
}
export function sortFindings(findings: readonly Finding[]): Finding[] {
	return [...findings].sort(
		(left, right) =>
			compareOptional(left.artifactPath, right.artifactPath) ||
			compareOptional(left.relativePath, right.relativePath) ||
			compareOptional(left.jsonPointer, right.jsonPointer) ||
			left.code.localeCompare(right.code),
	);
}

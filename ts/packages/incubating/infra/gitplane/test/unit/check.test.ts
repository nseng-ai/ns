import { expect, test } from "vitest";
import { checkArtifactCorpus, inspectCorpusTopology } from "@nseng-ai/gitplane";
const marker = (value: unknown) => ({
	path: "gitplane-artifact.json",
	kind: "regular-file" as const,
	bytes: Buffer.from(JSON.stringify(value)),
});
test("discovers recursive outer boundaries and short-circuits all nesting", () => {
	const topology = inspectCorpusTopology([
		{ path: "artifacts/a/gitplane-artifact.json", kind: "regular-file" },
		{ path: "artifacts/a/deep/gitplane-artifact.json", kind: "regular-file" },
		{ path: "artifacts/a/other/gitplane-artifact.json", kind: "directory" },
	]);
	expect(topology.artifactCount).toBe(1);
	expect(topology.boundaries).toEqual([]);
	expect(topology.findings).toEqual([
		{
			code: "nested-artifact",
			severity: "error",
			summary: "Artifacts cannot be nested.",
			artifactPath: "artifacts/a",
			relativePath: "deep/gitplane-artifact.json",
			relatedArtifactPaths: ["artifacts/a/deep"],
		},
		{
			code: "nested-artifact",
			severity: "error",
			summary: "Artifacts cannot be nested.",
			artifactPath: "artifacts/a",
			relativePath: "other/gitplane-artifact.json",
			relatedArtifactPaths: ["artifacts/a/other"],
		},
	]);
});
test("nested chains belong to the outer accepted boundary", () => {
	const topology = inspectCorpusTopology([
		{ path: "root/a/gitplane-artifact.json", kind: "regular-file" },
		{ path: "root/a/b/gitplane-artifact.json", kind: "regular-file" },
		{ path: "root/a/b/c/gitplane-artifact.json", kind: "regular-file" },
	]);
	expect(topology.artifactCount).toBe(1);
	expect(
		topology.findings.map(({ artifactPath, relativePath, relatedArtifactPaths }) => ({
			artifactPath,
			relativePath,
			relatedArtifactPaths,
		})),
	).toEqual([
		{
			artifactPath: "root/a",
			relativePath: "b/c/gitplane-artifact.json",
			relatedArtifactPaths: ["root/a/b/c"],
		},
		{
			artifactPath: "root/a",
			relativePath: "b/gitplane-artifact.json",
			relatedArtifactPaths: ["root/a/b"],
		},
	]);
});

test("aggregates envelope, registry, unsupported, and duplicate findings", () => {
	const id = "01jxyz8y3jqazj7jrx53w9b3dn";
	const result = checkArtifactCorpus({
		sourceId: "source",
		artifactCount: 5,
		candidates: [
			{ path: "a", entries: [marker({})] },
			{ path: "b", entries: [marker({ gpId: "bad" })] },
			{
				path: "c",
				entries: [marker({ gpId: id, gpApiVersion: "x", gpKind: "K", gpSchemaVersion: 1 })],
			},
			{ path: "d", entries: [marker({ gpId: id }), { path: "link", kind: "symlink" }] },
			{ path: "e", entries: [marker({ gpId: id })] },
		],
	});
	expect(result.type).toBe("invalid");
	if (result.type !== "invalid") throw new Error();
	expect(result.findings.map((item) => item.code)).toEqual([
		"invalid-marker-envelope",
		"invalid-artifact-id",
		"duplicate-artifact-id",
		"unknown-artifact-kind",
		"duplicate-artifact-id",
		"unsupported-artifact-entry",
		"duplicate-artifact-id",
	]);
	expect(
		result.findings.filter((item) => item.code === "duplicate-artifact-id")[0]
			?.relatedArtifactPaths,
	).toEqual(["c", "d", "e"]);
});
test("keeps independent defects and canonical IDs in duplicate detection", () => {
	const id = "01jxyz8y3jqazj7jrx53w9b3dn";
	const result = checkArtifactCorpus({
		sourceId: "source",
		artifactCount: 2,
		candidates: [
			{
				path: "a",
				entries: [
					marker({ gpId: id, gpApiVersion: "", gpKind: 1, gpSchemaVersion: 0 }),
					{ path: "link", kind: "symlink" },
				],
			},
			{ path: "b", entries: [marker({ gpId: id })] },
		],
	});
	expect(result.type).toBe("invalid");
	if (result.type !== "invalid") throw new Error();
	expect(
		result.findings
			.filter((finding) => finding.artifactPath === "a")
			.map((finding) => finding.code),
	).toEqual([
		"invalid-marker-envelope",
		"duplicate-artifact-id",
		"invalid-marker-envelope",
		"invalid-marker-envelope",
		"unsupported-artifact-entry",
	]);
	const duplicates = result.findings.filter((finding) => finding.code === "duplicate-artifact-id");
	expect(duplicates).toHaveLength(2);
	expect(duplicates[0]).toMatchObject({
		artifactId: id,
		relativePath: "gitplane-artifact.json",
		jsonPointer: "/gpId",
		relatedArtifactPaths: ["a", "b"],
		summary: `Artifact ID ${id} is shared by: a, b`,
	});
});

test("keeps generic artifacts independent of kind registration and pins registry pointers", () => {
	const id = "01jxyz8y3jqazj7jrx53w9b3dn";
	const generic = checkArtifactCorpus({
		sourceId: "source",
		artifactCount: 1,
		candidates: [{ path: "generic", entries: [marker({ gpId: id, domain: "uninterpreted" })] }],
		kinds: [],
	});
	expect(generic.type).toBe("ready");
	const classified = checkArtifactCorpus({
		sourceId: "source",
		artifactCount: 2,
		candidates: [
			{
				path: "unknown-kind",
				entries: [marker({ gpId: id, gpApiVersion: "x", gpKind: "K", gpSchemaVersion: 1 })],
			},
			{
				path: "unknown-schema",
				entries: [
					marker({
						gpId: "01jxyz8y3jqazj7jrx53w9b3dp",
						gpApiVersion: "x",
						gpKind: "Known",
						gpSchemaVersion: 2,
					}),
				],
			},
		],
		kinds: [
			{
				apiVersion: "x",
				kind: "Known",
				schemaVersions: { 1: { fields: {} } },
				transitions: [],
				target: {
					table: "known",
					lineage: {
						sourceId: "source_id",
						artifactId: "artifact_id",
						revisionId: "revision_id",
						path: "path",
						deleted: "deleted",
						deletedAtCommit: "deleted_at_commit",
					},
				},
			},
		],
	});
	expect(classified.type).toBe("invalid");
	if (classified.type !== "invalid") throw new Error("Expected invalid corpus");
	expect(classified.findings).toEqual([
		{
			code: "unknown-artifact-kind",
			severity: "error",
			summary: "Classified artifact kind is not registered.",
			artifactPath: "unknown-kind",
			artifactId: id,
			relativePath: "gitplane-artifact.json",
			jsonPointer: "/gpKind",
		},
		{
			code: "unknown-schema-version",
			severity: "error",
			summary: "Artifact schema version is not declared.",
			artifactPath: "unknown-schema",
			artifactId: "01jxyz8y3jqazj7jrx53w9b3dp",
			relativePath: "gitplane-artifact.json",
			jsonPointer: "/gpSchemaVersion",
		},
	]);
});

test("reports a nonregular marker exactly once", () => {
	const result = checkArtifactCorpus({
		sourceId: "source",
		artifactCount: 1,
		candidates: [{ path: "a", entries: [{ path: "gitplane-artifact.json", kind: "symlink" }] }],
	});
	expect(result).toEqual({
		type: "invalid",
		artifactCount: 1,
		findings: [
			{
				code: "unsupported-artifact-entry",
				severity: "error",
				summary: "Artifact entry kind is unsupported.",
				artifactPath: "a",
				relativePath: "gitplane-artifact.json",
			},
		],
	});
});

test("promotes an empty or clean corpus with digest", () => {
	expect(checkArtifactCorpus({ sourceId: "s", artifactCount: 0, candidates: [] })).toEqual({
		type: "ready",
		corpus: { artifacts: [] },
		findings: [],
	});
	const result = checkArtifactCorpus({
		sourceId: "s",
		artifactCount: 1,
		candidates: [
			{
				path: "a",
				entries: [
					marker({ gpId: "01jxyz8y3jqazj7jrx53w9b3dn" }),
					{ path: "body.txt", kind: "regular-file", bytes: Buffer.from("body") },
				],
			},
		],
	});
	expect(result.type).toBe("ready");
	if (result.type === "ready") expect(result.corpus.artifacts[0]?.digest.text).toMatch(/^sha256:/);
});

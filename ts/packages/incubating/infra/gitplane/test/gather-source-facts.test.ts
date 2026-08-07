import { expect, test } from "vitest";
import { gatherSourceFacts, parseArtifactId } from "@nseng-ai/gitplane";
import { InMemoryArtifactGateway } from "@nseng-ai/gitplane/testing";

const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error("Test artifact ID must be valid.");
const artifactId = parsed.artifactId;
const markerBytes = new TextEncoder().encode(`{"gpId":"${artifactId}","extra":true}`);

function gateway(
	options: {
		readonly ancestry?: boolean;
		readonly targetParents?: readonly string[];
		readonly provenanceUnavailable?: boolean;
	} = {},
) {
	const targetParents = options.targetParents ?? ["cursor"];
	return new InMemoryArtifactGateway({
		commits: { HEAD: { type: "found", value: "target" } },
		commitFacts: [
			{
				type: "found",
				value: { commit: "target", parents: targetParents, isMerge: targetParents.length > 1 },
			},
			{ type: "found", value: { commit: "cursor", parents: [], isMerge: false } },
		],
		ancestry: [
			{
				ancestor: "cursor",
				descendant: "target",
				observation: { type: "found", value: options.ancestry ?? true },
			},
		],
		commitInventories: ["target", "cursor"].map((commit) => ({
			commit,
			artifactRoot: "artifacts",
			observation: {
				type: "found" as const,
				value: [
					{ path: "artifacts/b/gitplane-artifact.json", kind: "regular-file" as const },
					{ path: "artifacts/a/gitplane-artifact.json", kind: "regular-file" as const },
				],
			},
		})),
		commitCandidates: ["target", "cursor"].flatMap((commit) => [
			{
				commit,
				candidate: {
					type: "found" as const,
					value: {
						path: "artifacts/a",
						entries: [
							{ path: "gitplane-artifact.json", kind: "regular-file" as const, bytes: markerBytes },
							{ path: "link", kind: "symlink" as const },
						],
					},
				},
			},
			{
				commit,
				candidate: {
					type: "found" as const,
					value: {
						path: "artifacts/b",
						entries: [
							{
								path: "gitplane-artifact.json",
								kind: "regular-file" as const,
								bytes: new Uint8Array([0xff]),
							},
						],
					},
				},
			},
		]),
		markerProvenance: [
			{
				targetCommit: "target",
				artifactRoot: "artifacts",
				observations: [
					options.provenanceUnavailable
						? { type: "unavailable", artifactId, reason: "incomplete-history" }
						: { type: "found", artifactId, markerLastChangedCommit: "target" },
				],
			},
		],
	});
}

test("Gather preserves raw candidates and assembles planner-ready history observations", async () => {
	const source = gateway();
	const result = await gatherSourceFacts({
		gateway: source,
		sourceId: "source",
		artifactRoot: "artifacts",
		targetCommitish: "HEAD",
		cursorCommit: "cursor",
		mode: "normal",
	});
	expect(result).toMatchObject({
		ok: true,
		facts: {
			type: "gathered",
			targetCommit: "target",
			relationship: { type: "ancestor" },
			markerProvenance: [
				{ type: "found", artifactId, markerLastChangedCommit: "target" },
				{ type: "identity-unavailable", path: "artifacts/b" },
			],
		},
	});
	if (!result.ok || result.facts.type !== "gathered") throw new Error("Expected gathered facts.");
	expect(result.facts.targetCorpus.candidates[0]?.entries).toContainEqual({
		path: "link",
		kind: "symlink",
	});
	expect(source.operationLog()).toContain("readMarkerProvenance:target:1");
});

test("Gather preserves no-cursor, equal, non-forward, unavailable-prior, merge, and provenance facts", async () => {
	const gather = (source: InMemoryArtifactGateway, cursorCommit: string | null) =>
		gatherSourceFacts({
			gateway: source,
			sourceId: "source",
			artifactRoot: "artifacts",
			targetCommitish: "HEAD",
			cursorCommit,
			mode: "normal",
		});
	for (const [source, cursorCommit, relationship] of [
		[gateway(), null, { type: "no-cursor" }],
		[gateway(), "target", { type: "equal" }],
		[gateway({ ancestry: false }), "cursor", { type: "non-forward" }],
		[gateway(), "missing", { type: "unavailable", reason: "missing-object" }],
	] as const) {
		const result = await gather(source, cursorCommit);
		expect(result).toMatchObject({ ok: true, facts: { relationship } });
	}
	const merge = await gather(gateway({ targetParents: ["left", "right"] }), null);
	expect(merge).toMatchObject({
		ok: true,
		facts: { targetFacts: { parents: ["left", "right"], isMerge: true } },
	});
	const unavailable = await gather(gateway({ provenanceUnavailable: true }), null);
	expect(unavailable).toMatchObject({
		ok: true,
		facts: {
			markerProvenance: [
				{ type: "unavailable", artifactId, reason: "incomplete-history" },
				{ type: "identity-unavailable", path: "artifacts/b" },
			],
		},
	});
});

test("Gather preserves invalid, nested, duplicate, and unsupported raw candidates", async () => {
	const duplicateMarker = new TextEncoder().encode(`{"gpId":"${artifactId}"}`);
	const source = new InMemoryArtifactGateway({
		commits: { HEAD: { type: "found", value: "target" } },
		commitFacts: [{ type: "found", value: { commit: "target", parents: [], isMerge: false } }],
		commitInventories: [
			{
				commit: "target",
				artifactRoot: "artifacts",
				observation: {
					type: "found",
					value: [
						{ path: "artifacts/outer/gitplane-artifact.json", kind: "regular-file" },
						{ path: "artifacts/outer/inner/gitplane-artifact.json", kind: "regular-file" },
						{ path: "artifacts/invalid/gitplane-artifact.json", kind: "regular-file" },
					],
				},
			},
		],
		commitCandidates: [
			["artifacts/outer", duplicateMarker],
			["artifacts/outer/inner", duplicateMarker],
			["artifacts/invalid", new Uint8Array([0xff])],
		].map(([candidatePath, bytes]) => ({
			commit: "target",
			candidate: {
				type: "found" as const,
				value: {
					path: candidatePath as string,
					entries: [
						{
							path: "gitplane-artifact.json",
							kind: "regular-file" as const,
							bytes: bytes as Uint8Array,
						},
						{ path: "unsupported", kind: "special" as const },
					],
				},
			},
		})),
		markerProvenance: [
			{
				targetCommit: "target",
				artifactRoot: "artifacts",
				observations: [{ type: "found", artifactId, markerLastChangedCommit: "target" }],
			},
		],
	});
	const result = await gatherSourceFacts({
		gateway: source,
		sourceId: "source",
		artifactRoot: "artifacts",
		targetCommitish: "HEAD",
		cursorCommit: null,
		mode: "full",
	});
	if (!result.ok || result.facts.type !== "gathered") throw new Error("Expected gathered facts.");
	expect(result.facts.targetCorpus.candidates.map((candidate) => candidate.path)).toEqual([
		"artifacts/invalid",
		"artifacts/outer",
		"artifacts/outer/inner",
	]);
	expect(
		result.facts.targetCorpus.candidates.every((candidate) =>
			candidate.entries.some((entry) => entry.kind === "special"),
		),
	).toBe(true);
	expect(result.facts.markerProvenance).toEqual([
		{ type: "found", artifactId, markerLastChangedCommit: "target" },
		{ type: "found", artifactId, markerLastChangedCommit: "target" },
		{ type: "identity-unavailable", path: "artifacts/invalid" },
	]);
});

test("Gather keeps target unavailability semantic and operational failures separate", async () => {
	const unavailable = new InMemoryArtifactGateway({
		commits: { missing: { type: "unavailable", reason: "missing-object" } },
	});
	expect(
		await gatherSourceFacts({
			gateway: unavailable,
			sourceId: "source",
			artifactRoot: "artifacts",
			targetCommitish: "missing",
			cursorCommit: null,
			mode: "full",
		}),
	).toEqual({
		ok: true,
		facts: {
			type: "target-unavailable",
			sourceId: "source",
			targetCommitish: "missing",
			cursorCommit: null,
			mode: "full",
			reason: "missing-object",
		},
	});
	const failed = new InMemoryArtifactGateway({
		failures: { resolveCommit: { code: "git-failed", message: "sanitized" } },
	});
	expect(
		await gatherSourceFacts({
			gateway: failed,
			sourceId: "source",
			artifactRoot: "artifacts",
			targetCommitish: "HEAD",
			cursorCommit: null,
			mode: "normal",
		}),
	).toEqual({ ok: false, error: { code: "git-failed", message: "sanitized" } });
});

import { gatherSourceFacts, parseArtifactId, type ArtifactCandidate } from "@nseng-ai/gitplane";
import { InMemoryArtifactGateway } from "@nseng-ai/gitplane/testing";
import { expect, test } from "vitest";

const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error("Test artifact ID must be valid.");
const artifactId = parsed.artifactId;
const secondParsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dp");
if (!secondParsed.ok) throw new Error("Second test artifact ID must be valid.");
const secondArtifactId = secondParsed.artifactId;

function markerCandidate(path: string, marker: unknown): ArtifactCandidate {
	const bytes =
		marker instanceof Uint8Array ? marker : new TextEncoder().encode(JSON.stringify(marker));
	return {
		path,
		entries: [{ path: "gitplane-artifact.json", kind: "regular-file", bytes }],
	};
}

function source(
	options: {
		readonly targetInventory?: readonly {
			readonly path: string;
			readonly kind: "regular-file" | "directory";
		}[];
		readonly targetCandidates?: readonly ArtifactCandidate[];
		readonly cursorCommit?: string;
		readonly cursorFacts?: "found" | "missing-object" | "incomplete-history";
		readonly cursorInventory?: "found" | "missing-object" | "incomplete-history";
		readonly relationship?: boolean | "missing-object" | "incomplete-history";
	} = {},
): InMemoryArtifactGateway {
	const candidates = options.targetCandidates ?? [
		markerCandidate("artifacts/a", { gpId: artifactId }),
	];
	const targetInventory =
		options.targetInventory ??
		candidates.map((candidate) => ({
			path: `${candidate.path}/gitplane-artifact.json`,
			kind: "regular-file" as const,
		}));
	const cursorCommit = options.cursorCommit ?? "cursor";
	const cursorFacts = options.cursorFacts ?? "found";
	const cursorInventory = options.cursorInventory ?? "found";
	const relationship = options.relationship ?? true;
	return new InMemoryArtifactGateway({
		commits: { HEAD: { type: "found", value: "target" } },
		commitFacts: [
			{
				commit: "target",
				observation: {
					type: "found",
					value: { commit: "target", parents: [cursorCommit], isMerge: false },
				},
			},
			{
				commit: cursorCommit,
				observation:
					cursorFacts === "found"
						? {
								type: "found",
								value: { commit: cursorCommit, parents: [], isMerge: false },
							}
						: { type: "unavailable", reason: cursorFacts },
			},
		],
		ancestry: [
			{
				ancestor: cursorCommit,
				descendant: "target",
				observation:
					typeof relationship === "boolean"
						? { type: "found", value: relationship }
						: { type: "unavailable", reason: relationship },
			},
		],
		commitInventories: [
			{
				commit: "target",
				artifactRoot: "artifacts",
				observation: { type: "found", value: targetInventory },
			},
			{
				commit: cursorCommit,
				artifactRoot: "artifacts",
				observation:
					cursorInventory === "found"
						? { type: "found", value: targetInventory }
						: { type: "unavailable", reason: cursorInventory },
			},
		],
		commitCandidates: ["target", cursorCommit].flatMap((commit) =>
			candidates.map((candidate) => ({
				commit,
				candidate: { type: "found" as const, value: candidate },
			})),
		),
		markerProvenance: candidates.flatMap((candidate) => {
			const marker = candidate.entries.find(
				(entry) => entry.kind === "regular-file" && entry.path === "gitplane-artifact.json",
			);
			if (marker?.kind !== "regular-file") return [];
			try {
				const value: unknown = JSON.parse(new TextDecoder().decode(marker.bytes));
				if (typeof value !== "object" || value === null || !("gpId" in value)) return [];
				const id = parseArtifactId(String(value.gpId));
				return id.ok
					? [
							{
								targetCommit: "target",
								artifactId: id.artifactId,
								path: candidate.path,
								observation: {
									type: "found" as const,
									artifactId: id.artifactId,
									markerLastChangedCommit: `at:${candidate.path}`,
								},
							},
						]
					: [];
			} catch {
				return [];
			}
		}),
	});
}

async function gather(gateway: InMemoryArtifactGateway, cursorCommit: string | null = "cursor") {
	return gatherSourceFacts({
		gateway,
		sourceId: "source",
		artifactRoot: "artifacts",
		targetCommitish: "HEAD",
		cursorCommit,
		mode: "normal",
	});
}

test("Gather represents no cursor explicitly", async () => {
	expect(await gather(source(), null)).toMatchObject({
		ok: true,
		facts: { type: "gathered", cursor: { type: "none" } },
	});
});

test.each(["missing-object", "incomplete-history"] as const)(
	"Gather records unavailable cursor commit facts: %s",
	async (reason) => {
		expect(await gather(source({ cursorFacts: reason }))).toMatchObject({
			ok: true,
			facts: { type: "gathered", cursor: { type: "unavailable", commit: "cursor", reason } },
		});
	},
);

test.each([
	["found", true, { type: "ancestor" }],
	["incomplete-history", true, { type: "ancestor" }],
	["found", "missing-object", { type: "unavailable", reason: "missing-object" }],
	["incomplete-history", "missing-object", { type: "unavailable", reason: "missing-object" }],
] as const)(
	"Gather observes cursor corpus %s independently from relationship %s",
	async (cursorInventory, relationship, expectedRelationship) => {
		const result = await gather(source({ cursorInventory, relationship }));
		expect(result).toMatchObject({
			ok: true,
			facts: {
				type: "gathered",
				cursor: {
					type: "observed",
					corpus:
						cursorInventory === "found"
							? { type: "found", value: { commit: "cursor" } }
							: { type: "unavailable", reason: cursorInventory },
					relationship: expectedRelationship,
				},
			},
		});
	},
);

class EqualCursorCorpusUnavailableGateway extends InMemoryArtifactGateway {
	private inventoryReads = 0;

	override async inventoryCommitTree(request: {
		readonly commit: string;
		readonly artifactRoot: string;
	}) {
		this.inventoryReads += 1;
		if (this.inventoryReads === 2)
			return {
				ok: true as const,
				value: { type: "unavailable" as const, reason: "incomplete-history" as const },
			};
		return super.inventoryCommitTree(request);
	}
}

test("equal cursor skips ancestry even when its corpus is unavailable", async () => {
	const gateway = new EqualCursorCorpusUnavailableGateway({
		commits: { HEAD: { type: "found", value: "target" } },
		commitFacts: [
			{
				commit: "target",
				observation: {
					type: "found",
					value: { commit: "target", parents: [], isMerge: false },
				},
			},
		],
		commitInventories: [
			{
				commit: "target",
				artifactRoot: "artifacts",
				observation: {
					type: "found",
					value: [{ path: "artifacts/a/gitplane-artifact.json", kind: "regular-file" }],
				},
			},
		],
		commitCandidates: [
			{
				commit: "target",
				candidate: {
					type: "found",
					value: markerCandidate("artifacts/a", { gpId: artifactId }),
				},
			},
		],
		markerProvenance: [
			{
				targetCommit: "target",
				artifactId,
				path: "artifacts/a",
				observation: {
					type: "found",
					artifactId,
					markerLastChangedCommit: "target",
				},
			},
		],
	});
	expect(await gather(gateway, "target")).toMatchObject({
		ok: true,
		facts: {
			type: "gathered",
			cursor: {
				type: "observed",
				corpus: { type: "unavailable", reason: "incomplete-history" },
				relationship: { type: "equal" },
			},
		},
	});
	expect(gateway.operationLog()).not.toContain("isAncestor:target:target");
});

test("target unavailability retains the requested cursor commit", async () => {
	const gateway = new InMemoryArtifactGateway({
		commits: { HEAD: { type: "unavailable", reason: "missing-object" } },
	});
	expect(await gather(gateway, "saved-cursor")).toEqual({
		ok: true,
		facts: {
			type: "target-unavailable",
			sourceId: "source",
			targetCommitish: "HEAD",
			cursorCommit: "saved-cursor",
			mode: "normal",
			reason: "missing-object",
		},
	});
});

test("canonical identity requests provenance despite invalid classification and retains raw candidate", async () => {
	const candidate = markerCandidate("artifacts/bad-classification", {
		gpId: artifactId,
		gpApiVersion: "v1",
	});
	const result = await gather(source({ targetCandidates: [candidate] }), null);
	if (!result.ok || result.facts.type !== "gathered") throw new Error("Expected gathered facts.");
	expect(result.facts.targetCorpus.candidates).toEqual([candidate]);
	expect(result.facts.markerProvenance).toEqual([
		{ type: "found", artifactId, markerLastChangedCommit: "at:artifacts/bad-classification" },
	]);
});

test.each([
	["invalid JSON", new Uint8Array([0xff])],
	["invalid ID", { gpId: "not-an-id" }],
] as const)("%s leaves marker identity unavailable", async (_label, marker) => {
	const result = await gather(
		source({ targetCandidates: [markerCandidate("artifacts/bad", marker)] }),
		null,
	);
	expect(result).toMatchObject({
		ok: true,
		facts: {
			type: "gathered",
			markerProvenance: [{ type: "identity-unavailable", path: "artifacts/bad" }],
		},
	});
});

test("only regular-file markers form boundaries, including at repository root", async () => {
	const root = markerCandidate("", { gpId: artifactId });
	const result = await gather(
		source({
			targetCandidates: [root],
			targetInventory: [
				{ path: "gitplane-artifact.json", kind: "regular-file" },
				{ path: "ignored/gitplane-artifact.json", kind: "directory" },
			],
		}),
		null,
	);
	if (!result.ok || result.facts.type !== "gathered") throw new Error("Expected gathered facts.");
	expect(result.facts.targetCorpus.candidates.map((candidate) => candidate.path)).toEqual([""]);
	expect(result.facts.markerProvenance).toEqual([
		{ type: "found", artifactId, markerLastChangedCommit: "at:" },
	]);
});

test("provenance stays aligned for duplicate IDs at different paths", async () => {
	const result = await gather(
		source({
			targetCandidates: [
				markerCandidate("artifacts/z", { gpId: artifactId }),
				markerCandidate("artifacts/a", { gpId: artifactId }),
			],
		}),
		null,
	);
	expect(result).toMatchObject({
		ok: true,
		facts: {
			type: "gathered",
			markerProvenance: [
				{ markerLastChangedCommit: "at:artifacts/a" },
				{ markerLastChangedCommit: "at:artifacts/z" },
			],
		},
	});
});

test("Gather orders valid identity/path provenance before sorted invalid paths", async () => {
	const result = await gather(
		source({
			targetCandidates: [
				markerCandidate("artifacts/z-invalid", { gpId: "bad" }),
				markerCandidate("artifacts/z-valid", { gpId: artifactId }),
				markerCandidate("artifacts/a-valid", { gpId: secondArtifactId }),
				markerCandidate("artifacts/a-invalid", new Uint8Array([0xff])),
			],
		}),
		null,
	);
	expect(result).toMatchObject({
		ok: true,
		facts: {
			type: "gathered",
			markerProvenance: [
				{ artifactId, markerLastChangedCommit: "at:artifacts/z-valid" },
				{ artifactId: secondArtifactId, markerLastChangedCommit: "at:artifacts/a-valid" },
				{ type: "identity-unavailable", path: "artifacts/a-invalid" },
				{ type: "identity-unavailable", path: "artifacts/z-invalid" },
			],
		},
	});
});

class SnapshotArtifactGateway extends InMemoryArtifactGateway {
	lastFacts?: object;
	lastInventory?: object;
	lastCandidate?: object;
	lastProvenance?: object;

	override async readCommitFacts(request: { readonly commit: string }) {
		const result = await super.readCommitFacts(request);
		if (result.ok && result.value.type === "found") this.lastFacts = result.value.value;
		return result;
	}
	override async inventoryCommitTree(request: {
		readonly commit: string;
		readonly artifactRoot: string;
	}) {
		const result = await super.inventoryCommitTree(request);
		if (result.ok && result.value.type === "found") this.lastInventory = result.value.value;
		return result;
	}
	override async readCommitTreeCandidate(request: {
		readonly commit: string;
		readonly path: string;
	}) {
		const result = await super.readCommitTreeCandidate(request);
		if (result.ok && result.value.type === "found") this.lastCandidate = result.value.value;
		return result;
	}
	override async readMarkerProvenance(
		request: Parameters<InMemoryArtifactGateway["readMarkerProvenance"]>[0],
	) {
		const result = await super.readMarkerProvenance(request);
		if (result.ok) this.lastProvenance = result.value;
		return result;
	}
}

test("Gather retains caller-owned gateway snapshots without making a second copy", async () => {
	const gateway = new SnapshotArtifactGateway({
		commits: { HEAD: { type: "found", value: "target" } },
		commitFacts: [
			{
				commit: "target",
				observation: { type: "found", value: { commit: "target", parents: [], isMerge: false } },
			},
		],
		commitInventories: [
			{
				commit: "target",
				artifactRoot: "artifacts",
				observation: {
					type: "found",
					value: [{ path: "artifacts/a/gitplane-artifact.json", kind: "regular-file" }],
				},
			},
		],
		commitCandidates: [
			{
				commit: "target",
				candidate: { type: "found", value: markerCandidate("artifacts/a", { gpId: artifactId }) },
			},
		],
		markerProvenance: [
			{
				targetCommit: "target",
				artifactId,
				path: "artifacts/a",
				observation: { type: "found", artifactId, markerLastChangedCommit: "target" },
			},
		],
	});
	const result = await gather(gateway, null);
	if (!result.ok || result.facts.type !== "gathered") throw new Error("Expected gathered facts.");
	expect(result.facts.targetFacts).toBe(gateway.lastFacts);
	expect(result.facts.targetCorpus.candidates[0]).toBe(gateway.lastCandidate);
	expect(result.facts.markerProvenance[0]).toBe(
		(gateway.lastProvenance as readonly object[] | undefined)?.[0],
	);
	expect(gateway.lastInventory).toBeDefined();
});

import {
	gatherSourceFacts,
	parseArtifactId,
	type ArtifactCandidate,
	type ArtifactKindRegistration,
} from "@nseng-ai/gitplane";
import { InMemoryArtifactGateway } from "@nseng-ai/gitplane/testing";
import { expect, test } from "vitest";

const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error("Test artifact ID must be valid.");
const artifactId = parsed.artifactId;
function markerCandidate(path: string, marker: unknown): ArtifactCandidate {
	return {
		path,
		entries: [
			{
				path: "gitplane-artifact.json",
				kind: "regular-file",
				bytes: new TextEncoder().encode(JSON.stringify(marker)),
			},
		],
	};
}

const registration: ArtifactKindRegistration = {
	apiVersion: "example.dev/v1",
	kind: "Greeting",
	schemaVersions: { 1: { fields: {} } },
	transitions: [],
	target: {
		table: "greetings",
		lineage: {
			sourceId: "source_id",
			artifactId: "artifact_id",
			revisionId: "revision_id",
			path: "artifact_path",
			deleted: "deleted",
			deletedAtCommit: "deleted_at_commit",
		},
	},
};

function source(
	options: {
		readonly inventoryObservation?:
			| { readonly type: "found" }
			| { readonly type: "unavailable"; readonly reason: "missing-object" };
		readonly candidates?: readonly ArtifactCandidate[];
		readonly candidateUnavailable?: boolean;
	} = {},
): InMemoryArtifactGateway {
	const candidates = options.candidates ?? [
		markerCandidate("artifacts/a", { gpId: artifactId }),
		markerCandidate("artifacts/a/nested", { gpId: "01jxyz8y3jqazj7jrx53w9b3dq" }),
		markerCandidate("artifacts/b", { gpId: "01jxyz8y3jqazj7jrx53w9b3dp" }),
	];
	const inventory = [
		{ path: "artifacts/a", kind: "directory" as const },
		{ path: "artifacts/a/gitplane-artifact.json", kind: "regular-file" as const },
		{ path: "artifacts/a/nested/gitplane-artifact.json", kind: "regular-file" as const },
		{ path: "artifacts/b/gitplane-artifact.json", kind: "regular-file" as const },
		{ path: "artifacts/blocked/gitplane-artifact.json", kind: "directory" as const },
	];
	return new InMemoryArtifactGateway({
		commits: { HEAD: { type: "found", value: "target" } },
		commitInventories: [
			{
				commit: "target",
				artifactRoot: "artifacts",
				observation:
					options.inventoryObservation?.type === "unavailable"
						? options.inventoryObservation
						: { type: "found", value: inventory },
			},
		],
		commitCandidates: candidates.map((candidate, index) => ({
			commit: "target",
			candidate:
				options.candidateUnavailable === true && index === 0
					? { type: "unavailable" as const, reason: "missing-object" as const }
					: { type: "found" as const, value: candidate },
		})),
	});
}

async function gather(gateway: InMemoryArtifactGateway) {
	return gatherSourceFacts({
		gateway,
		sourceId: "source",
		artifactRoot: "artifacts",
		targetCommitish: "HEAD",
		kinds: [registration],
	});
}

test("Gather returns one complete target snapshot", async () => {
	const gateway = source();
	const result = await gather(gateway);
	expect(result).toMatchObject({
		ok: true,
		facts: {
			type: "gathered",
			sourceId: "source",
			artifactRoot: "artifacts",
			targetCommit: "target",
			kinds: [registration],
			targetSnapshot: {
				commit: "target",
				candidates: [
					{ path: "artifacts/a" },
					{ path: "artifacts/a/nested" },
					{ path: "artifacts/b" },
				],
			},
		},
	});
	expect(gateway.operationLog()).toEqual([
		"resolveCommit:HEAD",
		"inventoryCommitTree:target:artifacts",
		"readCommitTreeCandidate:target:artifacts/a",
		"readCommitTreeCandidate:target:artifacts/a/nested",
		"readCommitTreeCandidate:target:artifacts/b",
	]);
});

test("Gather preserves complete raw topology before semantic validation", async () => {
	const result = await gather(source());
	if (!result.ok || result.facts.type !== "gathered") throw new Error("Expected gathered facts.");
	expect(result.facts.targetSnapshot.inventory).toEqual([
		{ path: "artifacts/a", kind: "directory" },
		{ path: "artifacts/a/gitplane-artifact.json", kind: "regular-file" },
		{ path: "artifacts/a/nested/gitplane-artifact.json", kind: "regular-file" },
		{ path: "artifacts/b/gitplane-artifact.json", kind: "regular-file" },
		{ path: "artifacts/blocked/gitplane-artifact.json", kind: "directory" },
	]);
});

test.each([
	{
		name: "resolution",
		gateway: new InMemoryArtifactGateway({
			commits: { HEAD: { type: "unavailable", reason: "missing-object" } },
		}),
		expectedLog: ["resolveCommit:HEAD"],
	},
	{
		name: "inventory",
		gateway: source({
			inventoryObservation: { type: "unavailable", reason: "missing-object" },
		}),
		expectedLog: ["resolveCommit:HEAD", "inventoryCommitTree:target:artifacts"],
	},
	{
		name: "candidate read",
		gateway: source({ candidateUnavailable: true }),
		expectedLog: [
			"resolveCommit:HEAD",
			"inventoryCommitTree:target:artifacts",
			"readCommitTreeCandidate:target:artifacts/a",
		],
	},
])(
	"target $name absence is typed and stops the complete scan",
	async ({ gateway, expectedLog }) => {
		expect(await gather(gateway)).toEqual({
			ok: true,
			facts: {
				type: "target-unavailable",
				sourceId: "source",
				targetCommitish: "HEAD",
				reason: "missing-object",
			},
		});
		expect(gateway.operationLog()).toEqual(expectedLog);
	},
);

test("Gateway failures remain operational Gather failures", async () => {
	const gateway = new InMemoryArtifactGateway({
		failures: { inventoryCommitTree: { code: "git-failed", message: "cannot inventory" } },
	});
	expect(await gather(gateway)).toEqual({
		ok: false,
		error: { code: "git-failed", message: "cannot inventory" },
	});
});

class SnapshotArtifactGateway extends InMemoryArtifactGateway {
	lastInventory?: object;
	lastCandidate?: object;

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
}

test("Gather retains caller-owned immutable gateway snapshots without another copy", async () => {
	const gateway = new SnapshotArtifactGateway({
		commits: { HEAD: { type: "found", value: "target" } },
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
	});
	const result = await gather(gateway);
	if (!result.ok || result.facts.type !== "gathered") throw new Error("Expected gathered facts.");
	expect(result.facts.targetSnapshot.inventory).toBe(gateway.lastInventory);
	expect(result.facts.targetSnapshot.candidates[0]).toBe(gateway.lastCandidate);
});

import { parseArtifactId } from "./artifact.ts";
import type { ArtifactCandidate } from "./domain.ts";
import type {
	ArtifactGateway,
	CommitFacts,
	GatewayError,
	GitObservation,
	MarkerProvenanceObservation,
	MarkerProvenanceRequest,
} from "./gateways.ts";

export type ReconciliationMode = "normal" | "full";
export type HistoryRelationship =
	| { readonly type: "no-cursor" }
	| { readonly type: "equal" }
	| { readonly type: "ancestor" }
	| { readonly type: "non-forward" }
	| { readonly type: "unavailable"; readonly reason: "missing-object" | "incomplete-history" };
export type CandidateMarkerProvenance =
	| MarkerProvenanceObservation
	| { readonly type: "identity-unavailable"; readonly path: string };
export interface CommitCorpusFacts {
	readonly commit: string;
	readonly candidates: readonly ArtifactCandidate[];
}
export type GatheredSourceFacts =
	| {
			readonly type: "target-unavailable";
			readonly sourceId: string;
			readonly targetCommitish: string;
			readonly cursorCommit: string | null;
			readonly mode: ReconciliationMode;
			readonly reason: "missing-object" | "incomplete-history";
	  }
	| {
			readonly type: "gathered";
			readonly sourceId: string;
			readonly artifactRoot: string;
			readonly targetCommit: string;
			readonly targetFacts: CommitFacts;
			readonly targetCorpus: CommitCorpusFacts;
			readonly cursorCommit: string | null;
			readonly cursorFacts: GitObservation<CommitFacts> | null;
			readonly cursorCorpus: GitObservation<CommitCorpusFacts> | null;
			readonly relationship: HistoryRelationship;
			readonly markerProvenance: readonly CandidateMarkerProvenance[];
			readonly mode: ReconciliationMode;
	  };
export type GatherSourceFactsResult =
	| { readonly ok: true; readonly facts: GatheredSourceFacts }
	| { readonly ok: false; readonly error: GatewayError };
export interface GatherSourceFactsOptions {
	readonly gateway: ArtifactGateway;
	readonly sourceId: string;
	readonly artifactRoot: string;
	readonly targetCommitish: string;
	readonly cursorCommit: string | null;
	readonly mode: ReconciliationMode;
}

export async function gatherSourceFacts(
	options: GatherSourceFactsOptions,
): Promise<GatherSourceFactsResult> {
	const resolved = await options.gateway.resolveCommit({ commitish: options.targetCommitish });
	if (!resolved.ok) return resolved;
	if (resolved.value.type === "unavailable") {
		return {
			ok: true,
			facts: {
				type: "target-unavailable",
				sourceId: options.sourceId,
				targetCommitish: options.targetCommitish,
				cursorCommit: options.cursorCommit,
				mode: options.mode,
				reason: resolved.value.reason,
			},
		};
	}
	const targetCommit = resolved.value.value;
	const targetFactsResult = await options.gateway.readCommitFacts({ commit: targetCommit });
	if (!targetFactsResult.ok) return targetFactsResult;
	if (targetFactsResult.value.type === "unavailable") {
		return {
			ok: true,
			facts: {
				type: "target-unavailable",
				sourceId: options.sourceId,
				targetCommitish: options.targetCommitish,
				cursorCommit: options.cursorCommit,
				mode: options.mode,
				reason: targetFactsResult.value.reason,
			},
		};
	}
	const targetCorpusResult = await readCorpus(options.gateway, targetCommit, options.artifactRoot);
	if (!targetCorpusResult.ok) return targetCorpusResult;
	if (targetCorpusResult.value.type === "unavailable") {
		return targetUnavailable(options, targetCorpusResult.value.reason);
	}

	const markerRequests: MarkerProvenanceRequest[] = [];
	const unavailableIdentities: CandidateMarkerProvenance[] = [];
	for (const candidate of targetCorpusResult.value.value.candidates) {
		const identity = decodeCandidateIdentity(candidate);
		if (identity === null)
			unavailableIdentities.push({ type: "identity-unavailable", path: candidate.path });
		else markerRequests.push(identity);
	}
	markerRequests.sort((left, right) => left.artifactId.localeCompare(right.artifactId));
	const provenance = await options.gateway.readMarkerProvenance({
		targetCommit,
		artifactRoot: options.artifactRoot,
		markers: markerRequests,
	});
	if (!provenance.ok) return provenance;

	let cursorFacts: GitObservation<CommitFacts> | null = null;
	let cursorCorpus: GitObservation<CommitCorpusFacts> | null = null;
	let relationship: HistoryRelationship = { type: "no-cursor" };
	if (options.cursorCommit !== null) {
		const readCursorFacts = await options.gateway.readCommitFacts({ commit: options.cursorCommit });
		if (!readCursorFacts.ok) return readCursorFacts;
		cursorFacts = readCursorFacts.value;
		if (readCursorFacts.value.type === "unavailable") {
			relationship = { type: "unavailable", reason: readCursorFacts.value.reason };
			cursorCorpus = readCursorFacts.value;
		} else {
			const readCursorCorpus = await readCorpus(
				options.gateway,
				options.cursorCommit,
				options.artifactRoot,
			);
			if (!readCursorCorpus.ok) return readCursorCorpus;
			cursorCorpus = readCursorCorpus.value;
			if (options.cursorCommit === targetCommit) relationship = { type: "equal" };
			else {
				const ancestry = await options.gateway.isAncestor({
					ancestor: options.cursorCommit,
					descendant: targetCommit,
				});
				if (!ancestry.ok) return ancestry;
				relationship =
					ancestry.value.type === "unavailable"
						? { type: "unavailable", reason: ancestry.value.reason }
						: { type: ancestry.value.value ? "ancestor" : "non-forward" };
			}
		}
	}
	return {
		ok: true,
		facts: {
			type: "gathered",
			sourceId: options.sourceId,
			artifactRoot: options.artifactRoot,
			targetCommit,
			targetFacts: copyCommitFacts(targetFactsResult.value.value),
			targetCorpus: copyCorpus(targetCorpusResult.value.value),
			cursorCommit: options.cursorCommit,
			cursorFacts: copyObservation(cursorFacts, copyCommitFacts),
			cursorCorpus: copyObservation(cursorCorpus, copyCorpus),
			relationship,
			markerProvenance: [
				...provenance.value.map((item) => ({ ...item })),
				...unavailableIdentities.sort((left, right) =>
					"path" in left && "path" in right ? left.path.localeCompare(right.path) : 0,
				),
			],
			mode: options.mode,
		},
	};
}

async function readCorpus(
	gateway: ArtifactGateway,
	commit: string,
	artifactRoot: string,
): Promise<
	| { readonly ok: false; readonly error: GatewayError }
	| { readonly ok: true; readonly value: GitObservation<CommitCorpusFacts> }
> {
	const inventory = await gateway.inventoryCommitTree({ commit, artifactRoot });
	if (!inventory.ok) return inventory;
	if (inventory.value.type === "unavailable") return { ok: true, value: inventory.value };
	const boundaryPaths = inventory.value.value
		.filter(
			(entry) =>
				entry.path.endsWith("/gitplane-artifact.json") || entry.path === "gitplane-artifact.json",
		)
		.map((entry) => entry.path.slice(0, -"/gitplane-artifact.json".length))
		.sort();
	const candidates: ArtifactCandidate[] = [];
	for (const candidatePath of boundaryPaths) {
		const candidate = await gateway.readCommitTreeCandidate({ commit, path: candidatePath });
		if (!candidate.ok) return candidate;
		if (candidate.value.type === "unavailable") return { ok: true, value: candidate.value };
		candidates.push(copyCandidate(candidate.value.value));
	}
	return { ok: true as const, value: { type: "found" as const, value: { commit, candidates } } };
}

function decodeCandidateIdentity(candidate: ArtifactCandidate): MarkerProvenanceRequest | null {
	const marker = candidate.entries.find(
		(entry): entry is Extract<typeof entry, { readonly kind: "regular-file" }> =>
			entry.path === "gitplane-artifact.json" && entry.kind === "regular-file",
	);
	if (marker === undefined) return null;
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(marker.bytes));
		if (typeof value !== "object" || value === null || !("gpId" in value)) return null;
		const gpId = (value as { readonly gpId?: unknown }).gpId;
		if (typeof gpId !== "string") return null;
		const parsed = parseArtifactId(gpId);
		if (!parsed.ok) return null;
		return {
			artifactId: parsed.artifactId,
			path: candidate.path,
			markerBytes: new Uint8Array(marker.bytes),
		};
	} catch {
		return null;
	}
}

function targetUnavailable(
	options: GatherSourceFactsOptions,
	reason: "missing-object" | "incomplete-history",
): GatherSourceFactsResult {
	return {
		ok: true,
		facts: {
			type: "target-unavailable",
			sourceId: options.sourceId,
			targetCommitish: options.targetCommitish,
			cursorCommit: options.cursorCommit,
			mode: options.mode,
			reason,
		},
	};
}
function copyCandidate(candidate: ArtifactCandidate): ArtifactCandidate {
	return {
		path: candidate.path,
		entries: candidate.entries.map((entry) =>
			entry.kind === "regular-file"
				? { ...entry, bytes: new Uint8Array(entry.bytes) }
				: { ...entry },
		),
	};
}
function copyCorpus(corpus: CommitCorpusFacts): CommitCorpusFacts {
	return { commit: corpus.commit, candidates: corpus.candidates.map(copyCandidate) };
}
function copyCommitFacts(facts: CommitFacts): CommitFacts {
	return { ...facts, parents: [...facts.parents] };
}
function copyObservation<T>(
	observation: GitObservation<T> | null,
	copy: (value: T) => T,
): GitObservation<T> | null {
	return observation?.type === "found"
		? { type: "found", value: copy(observation.value) }
		: observation === null
			? null
			: { ...observation };
}

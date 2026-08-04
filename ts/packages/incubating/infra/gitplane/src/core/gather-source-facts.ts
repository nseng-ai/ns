import { ARTIFACT_MARKER_NAME } from "./artifact.ts";
import type { ArtifactCandidate } from "./domain.ts";
import type {
	ArtifactGateway,
	CommitFacts,
	GatewayError,
	GitObservation,
	GitUnavailableReason,
} from "./gateways.ts";

export type ReconciliationMode = "normal" | "full";
export type HistoryRelationship =
	| { readonly type: "equal" }
	| { readonly type: "ancestor" }
	| { readonly type: "non-forward" }
	| { readonly type: "unavailable"; readonly reason: GitUnavailableReason };
export interface CommitCorpusFacts {
	readonly commit: string;
	readonly candidates: readonly ArtifactCandidate[];
}
export type GatheredCursorFacts =
	| { readonly type: "none" }
	| { readonly type: "unavailable"; readonly commit: string; readonly reason: GitUnavailableReason }
	| {
			readonly type: "observed";
			readonly commit: string;
			readonly facts: CommitFacts;
			readonly corpus: GitObservation<CommitCorpusFacts>;
			readonly relationship: HistoryRelationship;
	  };
export type GatheredSourceFacts =
	| {
			readonly type: "target-unavailable";
			readonly sourceId: string;
			readonly targetCommitish: string;
			readonly cursorCommit: string | null;
			readonly mode: ReconciliationMode;
			readonly reason: GitUnavailableReason;
	  }
	| {
			readonly type: "gathered";
			readonly sourceId: string;
			readonly artifactRoot: string;
			readonly targetCommit: string;
			readonly targetFacts: CommitFacts;
			readonly targetCorpus: CommitCorpusFacts;
			readonly cursor: GatheredCursorFacts;
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
	if (resolved.value.type === "unavailable")
		return targetUnavailable(options, resolved.value.reason);

	const targetCommit = resolved.value.value;
	const targetFactsResult = await options.gateway.readCommitFacts({ commit: targetCommit });
	if (!targetFactsResult.ok) return targetFactsResult;
	if (targetFactsResult.value.type === "unavailable")
		return targetUnavailable(options, targetFactsResult.value.reason);

	const targetCorpusResult = await readCorpus(options.gateway, targetCommit, options.artifactRoot);
	if (!targetCorpusResult.ok) return targetCorpusResult;
	if (targetCorpusResult.value.type === "unavailable")
		return targetUnavailable(options, targetCorpusResult.value.reason);

	const cursorResult = await gatherCursorFacts(options, targetCommit);
	if (!cursorResult.ok) return cursorResult;

	return {
		ok: true,
		facts: {
			type: "gathered",
			sourceId: options.sourceId,
			artifactRoot: options.artifactRoot,
			targetCommit,
			targetFacts: targetFactsResult.value.value,
			targetCorpus: targetCorpusResult.value.value,
			cursor: cursorResult.value,
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
	| {
			readonly ok: true;
			readonly value:
				| { readonly type: "found"; readonly value: CommitCorpusFacts }
				| { readonly type: "unavailable"; readonly reason: GitUnavailableReason };
	  }
> {
	const inventory = await gateway.inventoryCommitTree({ commit, artifactRoot });
	if (!inventory.ok) return inventory;
	if (inventory.value.type === "unavailable") return { ok: true, value: inventory.value };
	const boundaryPaths = inventory.value.value
		.filter(
			(entry) =>
				entry.kind === "regular-file" && entry.path.split("/").at(-1) === ARTIFACT_MARKER_NAME,
		)
		.map((entry) => entry.path.slice(0, -(ARTIFACT_MARKER_NAME.length + 1)))
		.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
	const candidates: ArtifactCandidate[] = [];
	for (const candidatePath of boundaryPaths) {
		const candidate = await gateway.readCommitTreeCandidate({ commit, path: candidatePath });
		if (!candidate.ok) return candidate;
		if (candidate.value.type === "unavailable") return { ok: true, value: candidate.value };
		candidates.push(candidate.value.value);
	}
	return { ok: true, value: { type: "found", value: { commit, candidates } } };
}

async function gatherCursorFacts(
	options: GatherSourceFactsOptions,
	targetCommit: string,
): Promise<
	| { readonly ok: false; readonly error: GatewayError }
	| { readonly ok: true; readonly value: GatheredCursorFacts }
> {
	if (options.cursorCommit === null) return { ok: true, value: { type: "none" } };
	const commit = options.cursorCommit;
	const factsResult = await options.gateway.readCommitFacts({ commit });
	if (!factsResult.ok) return factsResult;
	if (factsResult.value.type === "unavailable")
		return { ok: true, value: { type: "unavailable", commit, reason: factsResult.value.reason } };

	const corpusResult = await readCorpus(options.gateway, commit, options.artifactRoot);
	if (!corpusResult.ok) return corpusResult;

	let relationship: HistoryRelationship;
	if (commit === targetCommit) relationship = { type: "equal" };
	else {
		const ancestry = await options.gateway.isAncestor({
			ancestor: commit,
			descendant: targetCommit,
		});
		if (!ancestry.ok) return ancestry;
		relationship =
			ancestry.value.type === "unavailable"
				? { type: "unavailable", reason: ancestry.value.reason }
				: { type: ancestry.value.value ? "ancestor" : "non-forward" };
	}
	return {
		ok: true,
		value: {
			type: "observed",
			commit,
			facts: factsResult.value.value,
			corpus: corpusResult.value,
			relationship,
		},
	};
}

function targetUnavailable(
	options: GatherSourceFactsOptions,
	reason: GitUnavailableReason,
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

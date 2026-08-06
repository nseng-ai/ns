import { ARTIFACT_MARKER_NAME } from "./artifact.ts";
import type { ArtifactCandidate, ArtifactKindRegistration } from "./domain.ts";
import type {
	ArtifactGateway,
	GatewayError,
	GitObservation,
	TreeInventoryEntry,
} from "./gateways.ts";

export type ReconciliationMode = "normal" | "repair";
export interface TargetSnapshotFacts {
	readonly commit: string;
	readonly inventory: readonly TreeInventoryEntry[];
	readonly candidates: readonly ArtifactCandidate[];
}
export type GatheredSourceFacts =
	| {
			readonly type: "target-unavailable";
			readonly sourceId: string;
			readonly targetCommitish: string;
			readonly mode: ReconciliationMode;
			readonly reason: "missing-object";
	  }
	| {
			readonly type: "gathered";
			readonly sourceId: string;
			readonly artifactRoot: string;
			readonly targetCommit: string;
			readonly targetSnapshot: TargetSnapshotFacts;
			readonly kinds: readonly ArtifactKindRegistration[];
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
	readonly kinds: readonly ArtifactKindRegistration[];
	readonly mode: ReconciliationMode;
}

export async function gatherSourceFacts(
	options: GatherSourceFactsOptions,
): Promise<GatherSourceFactsResult> {
	const resolved = await options.gateway.resolveCommit({ commitish: options.targetCommitish });
	if (!resolved.ok) return resolved;
	if (resolved.value.type === "unavailable") return targetUnavailable(options);

	const targetCommit = resolved.value.value;
	const targetSnapshotResult = await readTargetSnapshot(
		options.gateway,
		targetCommit,
		options.artifactRoot,
	);
	if (!targetSnapshotResult.ok) return targetSnapshotResult;
	if (targetSnapshotResult.value.type === "unavailable") return targetUnavailable(options);

	return {
		ok: true,
		facts: {
			type: "gathered",
			sourceId: options.sourceId,
			artifactRoot: options.artifactRoot,
			targetCommit,
			targetSnapshot: targetSnapshotResult.value.value,
			kinds: options.kinds,
			mode: options.mode,
		},
	};
}

async function readTargetSnapshot(
	gateway: ArtifactGateway,
	commit: string,
	artifactRoot: string,
): Promise<
	| { readonly ok: false; readonly error: GatewayError }
	| { readonly ok: true; readonly value: GitObservation<TargetSnapshotFacts> }
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
	return {
		ok: true,
		value: {
			type: "found",
			value: { commit, inventory: inventory.value.value, candidates },
		},
	};
}

function targetUnavailable(options: GatherSourceFactsOptions): GatherSourceFactsResult {
	return {
		ok: true,
		facts: {
			type: "target-unavailable",
			sourceId: options.sourceId,
			targetCommitish: options.targetCommitish,
			mode: options.mode,
			reason: "missing-object",
		},
	};
}

import type {
	ArtifactCandidate,
	ArtifactGateway,
	CommitDiff,
	CommitFacts,
	CreateArtifactRequest,
	CreateArtifactResult,
	GatewayError,
	GatewayResult,
	GitObservation,
	MarkerProvenanceObservation,
	MarkerProvenanceRequest,
	TreeInventoryEntry,
} from "../core/index.ts";

type FailureKey = keyof ArtifactGateway;
export interface InMemoryArtifactGatewayState {
	readonly created?: readonly CreateArtifactRequest[];
	readonly commits?: Readonly<Record<string, GitObservation<string>>>;
	readonly commitFacts?: readonly {
		readonly commit: string;
		readonly observation: GitObservation<CommitFacts>;
	}[];
	readonly ancestry?: readonly {
		readonly ancestor: string;
		readonly descendant: string;
		readonly observation: GitObservation<boolean>;
	}[];
	readonly commitInventories?: readonly {
		readonly commit: string;
		readonly artifactRoot: string;
		readonly observation: GitObservation<readonly TreeInventoryEntry[]>;
	}[];
	readonly commitCandidates?: readonly {
		readonly commit: string;
		readonly candidate: GitObservation<ArtifactCandidate>;
	}[];
	readonly markerProvenance?: readonly {
		readonly targetCommit: string;
		readonly artifactId: MarkerProvenanceRequest["artifactId"];
		readonly path: string;
		readonly observation: MarkerProvenanceObservation;
	}[];
	readonly workingInventories?: readonly {
		readonly artifactRoot: string;
		readonly entries: readonly TreeInventoryEntry[];
	}[];
	readonly workingCandidates?: readonly ArtifactCandidate[];
	readonly diffs?: readonly GitObservation<CommitDiff>[];
	readonly failures?: Partial<Record<FailureKey, GatewayError>>;
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
function copyObservation<T>(
	observation: GitObservation<T>,
	copy: (value: T) => T,
): GitObservation<T> {
	return observation.type === "found"
		? { type: "found", value: copy(observation.value) }
		: { ...observation };
}
function result<T>(failure: GatewayError | undefined, value: T): GatewayResult<T> {
	return failure === undefined ? { ok: true, value } : { ok: false, error: { ...failure } };
}
export class InMemoryArtifactGateway implements ArtifactGateway {
	private readonly created: CreateArtifactRequest[];
	private readonly operations: string[] = [];
	private readonly state: InMemoryArtifactGatewayState;
	constructor(state: InMemoryArtifactGatewayState = {}) {
		this.state = structuredClone(state);
		this.created = (this.state.created ?? []).map((item) => ({ ...item }));
	}
	createdArtifacts(): readonly CreateArtifactRequest[] {
		return this.created.map((item) => ({ ...item }));
	}
	operationLog(): readonly string[] {
		return [...this.operations];
	}
	async createArtifact(request: CreateArtifactRequest): Promise<CreateArtifactResult> {
		const failure = this.state.failures?.createArtifact;
		if (failure !== undefined) return { type: "error", error: { ...failure } };
		if (this.created.some((item) => item.directory === request.directory))
			return { type: "target-exists" };
		this.created.push({ ...request });
		return { type: "created", directory: request.directory, artifactId: request.artifactId };
	}
	async resolveCommit(request: {
		readonly commitish: string;
	}): Promise<GatewayResult<GitObservation<string>>> {
		return result(
			this.state.failures?.resolveCommit,
			structuredClone(
				this.state.commits?.[request.commitish] ?? {
					type: "found",
					value: request.commitish,
				},
			),
		);
	}
	async readCommitFacts(request: {
		readonly commit: string;
	}): Promise<GatewayResult<GitObservation<CommitFacts>>> {
		const found = this.state.commitFacts?.find((item) => item.commit === request.commit);
		return result(
			this.state.failures?.readCommitFacts,
			copyObservation(
				found?.observation ?? { type: "unavailable", reason: "missing-object" },
				(facts) => ({ ...facts, parents: [...facts.parents] }),
			),
		);
	}
	async isAncestor(request: {
		readonly ancestor: string;
		readonly descendant: string;
	}): Promise<GatewayResult<GitObservation<boolean>>> {
		this.operations.push(`isAncestor:${request.ancestor}:${request.descendant}`);
		const found = this.state.ancestry?.find(
			(item) => item.ancestor === request.ancestor && item.descendant === request.descendant,
		);
		return result(
			this.state.failures?.isAncestor,
			found?.observation ?? { type: "found", value: false },
		);
	}
	async inventoryCommitTree(request: {
		readonly commit: string;
		readonly artifactRoot: string;
	}): Promise<GatewayResult<GitObservation<readonly TreeInventoryEntry[]>>> {
		this.operations.push(`inventoryCommitTree:${request.commit}:${request.artifactRoot}`);
		const found = this.state.commitInventories?.find(
			(item) => item.commit === request.commit && item.artifactRoot === request.artifactRoot,
		);
		return result(
			this.state.failures?.inventoryCommitTree,
			copyObservation(
				found?.observation ?? { type: "unavailable", reason: "missing-object" },
				(entries) => entries.map((entry) => ({ ...entry })),
			),
		);
	}
	async readCommitTreeCandidate(request: {
		readonly commit: string;
		readonly path: string;
	}): Promise<GatewayResult<GitObservation<ArtifactCandidate>>> {
		this.operations.push(`readCommitTreeCandidate:${request.commit}:${request.path}`);
		const found = this.state.commitCandidates?.find(
			(item) =>
				item.commit === request.commit &&
				item.candidate.type === "found" &&
				item.candidate.value.path === request.path,
		);
		return result(
			this.state.failures?.readCommitTreeCandidate,
			copyObservation(
				found?.candidate ?? { type: "unavailable", reason: "missing-object" },
				copyCandidate,
			),
		);
	}
	async readMarkerProvenance(request: {
		readonly targetCommit: string;
		readonly markers: readonly MarkerProvenanceRequest[];
	}): Promise<GatewayResult<readonly MarkerProvenanceObservation[]>> {
		this.operations.push(`readMarkerProvenance:${request.targetCommit}:${request.markers.length}`);
		const remaining = [...(this.state.markerProvenance ?? [])];
		const observations = request.markers.map((marker) => {
			const index = remaining.findIndex(
				(item) =>
					item.targetCommit === request.targetCommit &&
					item.artifactId === marker.artifactId &&
					item.path === marker.path,
			);
			if (index < 0)
				return {
					type: "unavailable" as const,
					artifactId: marker.artifactId,
					reason: "incomplete-history" as const,
				};
			const [found] = remaining.splice(index, 1);
			if (found === undefined) throw new Error("Matched provenance fixture disappeared.");
			return { ...found.observation };
		});
		return result(this.state.failures?.readMarkerProvenance, observations);
	}
	async inventoryWorkingTree(request: {
		readonly artifactRoot: string;
	}): Promise<GatewayResult<readonly TreeInventoryEntry[]>> {
		this.operations.push("inventoryWorkingTree");
		const found = this.state.workingInventories?.find(
			(item) => item.artifactRoot === request.artifactRoot,
		);
		return result(
			this.state.failures?.inventoryWorkingTree,
			(found?.entries ?? []).map((item) => ({ ...item })),
		);
	}
	async readWorkingTreeCandidate(request: {
		readonly path: string;
	}): Promise<GatewayResult<ArtifactCandidate>> {
		this.operations.push(`readWorkingTreeCandidate:${request.path}`);
		const failure = this.state.failures?.readWorkingTreeCandidate;
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		const found = this.state.workingCandidates?.find((item) => item.path === request.path);
		return found === undefined
			? { ok: false, error: { code: "artifact-missing", message: request.path } }
			: { ok: true, value: copyCandidate(found) };
	}
	async diffCommits(request: {
		readonly fromCommit: string;
		readonly toCommit: string;
	}): Promise<GatewayResult<GitObservation<CommitDiff>>> {
		const found = this.state.diffs?.find(
			(item) =>
				item.type === "found" &&
				item.value.fromCommit === request.fromCommit &&
				item.value.toCommit === request.toCommit,
		);
		return result(
			this.state.failures?.diffCommits,
			copyObservation(found ?? { type: "unavailable", reason: "missing-object" }, (diff) => ({
				...diff,
				changedPaths: [...diff.changedPaths],
			})),
		);
	}
}

import type {
	ArtifactCandidate,
	ArtifactGateway,
	CreateArtifactRequest,
	CreateArtifactResult,
	GatewayError,
	GatewayResult,
	GitObservation,
	TreeInventoryEntry,
} from "../core/index.ts";

type FailureKey = keyof ArtifactGateway;
export interface InMemoryArtifactGatewayState {
	readonly created?: readonly CreateArtifactRequest[];
	readonly commits?: Readonly<Record<string, GitObservation<string>>>;
	readonly commitInventories?: readonly {
		readonly commit: string;
		readonly artifactRoot: string;
		readonly observation: GitObservation<readonly TreeInventoryEntry[]>;
	}[];
	readonly commitCandidates?: readonly {
		readonly commit: string;
		readonly candidate: GitObservation<ArtifactCandidate>;
	}[];
	readonly workingInventories?: readonly {
		readonly artifactRoot: string;
		readonly entries: readonly TreeInventoryEntry[];
	}[];
	readonly workingCandidates?: readonly ArtifactCandidate[];
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
		this.operations.push(`resolveCommit:${request.commitish}`);
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
}

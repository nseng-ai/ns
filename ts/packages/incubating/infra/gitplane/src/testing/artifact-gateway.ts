import type {
	ArtifactBoundary,
	ArtifactGateway,
	ArtifactSnapshot,
	CommitDiff,
	CommitFacts,
	CreateArtifactRequest,
	CreateArtifactResult,
	GatewayError,
	GatewayResult,
} from "../core/index.ts";

type FailureKey = keyof ArtifactGateway;
export interface InMemoryArtifactGatewayState {
	readonly created?: readonly CreateArtifactRequest[];
	readonly commits?: Readonly<Record<string, string>>;
	readonly commitFacts?: readonly CommitFacts[];
	readonly ancestry?: readonly { readonly ancestor: string; readonly descendant: string }[];
	readonly workingBoundaries?: readonly {
		readonly artifactRoot: string;
		readonly boundaries: readonly ArtifactBoundary[];
	}[];
	readonly commitBoundaries?: readonly {
		readonly commit: string;
		readonly artifactRoot: string;
		readonly boundaries: readonly ArtifactBoundary[];
	}[];
	readonly workingSnapshots?: readonly ArtifactSnapshot[];
	readonly commitSnapshots?: Readonly<Record<string, readonly ArtifactSnapshot[]>>;
	readonly diffs?: readonly CommitDiff[];
	readonly failures?: Partial<Record<FailureKey, GatewayError>>;
}
function copySnapshot(snapshot: ArtifactSnapshot): ArtifactSnapshot {
	return {
		...snapshot,
		entries: snapshot.entries.map((entry) => ({ ...entry, bytes: new Uint8Array(entry.bytes) })),
		envelope: structuredClone(snapshot.envelope),
		classification: structuredClone(snapshot.classification),
	};
}
function result<T>(failure: GatewayError | undefined, value: T): GatewayResult<T> {
	return failure === undefined ? { ok: true, value } : { ok: false, error: { ...failure } };
}
export class InMemoryArtifactGateway implements ArtifactGateway {
	private readonly created: CreateArtifactRequest[];
	private readonly state: InMemoryArtifactGatewayState;
	constructor(state: InMemoryArtifactGatewayState = {}) {
		this.state = structuredClone(state);
		this.created = (state.created ?? []).map((item) => ({ ...item }));
	}
	createdArtifacts(): readonly CreateArtifactRequest[] {
		return this.created.map((item) => ({ ...item }));
	}
	async createArtifact(request: CreateArtifactRequest): Promise<CreateArtifactResult> {
		const failure = this.state.failures?.createArtifact;
		if (failure !== undefined) return { type: "error", error: { ...failure } };
		if (this.created.some((item) => item.directory === request.directory))
			return { type: "target-exists" };
		this.created.push({ ...request });
		return { type: "created", directory: request.directory, artifactId: request.artifactId };
	}
	async resolveCommit(request: { readonly commitish: string }): Promise<GatewayResult<string>> {
		return result(
			this.state.failures?.resolveCommit,
			this.state.commits?.[request.commitish] ?? request.commitish,
		);
	}
	async readCommitFacts(request: { readonly commit: string }): Promise<GatewayResult<CommitFacts>> {
		const failure = this.state.failures?.readCommitFacts;
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		const found = this.state.commitFacts?.find((item) => item.commit === request.commit);
		return found === undefined
			? { ok: false, error: { code: "commit-missing", message: request.commit } }
			: { ok: true, value: { ...found, parents: [...found.parents] } };
	}
	async isAncestor(request: {
		readonly ancestor: string;
		readonly descendant: string;
	}): Promise<GatewayResult<boolean>> {
		return result(
			this.state.failures?.isAncestor,
			this.state.ancestry?.some(
				(item) => item.ancestor === request.ancestor && item.descendant === request.descendant,
			) ?? false,
		);
	}
	async discoverWorkingTree(request: {
		readonly artifactRoot: string;
	}): Promise<GatewayResult<readonly ArtifactBoundary[]>> {
		const found = this.state.workingBoundaries?.find(
			(item) => item.artifactRoot === request.artifactRoot,
		);
		return result(
			this.state.failures?.discoverWorkingTree,
			(found?.boundaries ?? []).map((item) => ({ ...item })),
		);
	}
	async discoverCommitTree(request: {
		readonly commit: string;
		readonly artifactRoot: string;
	}): Promise<GatewayResult<readonly ArtifactBoundary[]>> {
		const found = this.state.commitBoundaries?.find(
			(item) => item.commit === request.commit && item.artifactRoot === request.artifactRoot,
		);
		return result(
			this.state.failures?.discoverCommitTree,
			(found?.boundaries ?? []).map((item) => ({ ...item })),
		);
	}
	async readWorkingTreeSnapshot(request: {
		readonly sourceId: string;
		readonly path: string;
	}): Promise<GatewayResult<ArtifactSnapshot>> {
		const failure = this.state.failures?.readWorkingTreeSnapshot;
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		const found = this.state.workingSnapshots?.find(
			(item) => item.sourceId === request.sourceId && item.path === request.path,
		);
		return found === undefined
			? { ok: false, error: { code: "artifact-missing", message: request.path } }
			: { ok: true, value: copySnapshot(found) };
	}
	async readCommitTreeSnapshot(request: {
		readonly sourceId: string;
		readonly commit: string;
		readonly path: string;
	}): Promise<GatewayResult<ArtifactSnapshot>> {
		const failure = this.state.failures?.readCommitTreeSnapshot;
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		const found = this.state.commitSnapshots?.[request.commit]?.find(
			(item) => item.sourceId === request.sourceId && item.path === request.path,
		);
		return found === undefined
			? { ok: false, error: { code: "artifact-missing", message: request.path } }
			: { ok: true, value: copySnapshot(found) };
	}
	async diffCommits(request: {
		readonly fromCommit: string;
		readonly toCommit: string;
	}): Promise<GatewayResult<CommitDiff>> {
		const failure = this.state.failures?.diffCommits;
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		const found = this.state.diffs?.find(
			(item) => item.fromCommit === request.fromCommit && item.toCommit === request.toCommit,
		);
		return found === undefined
			? {
					ok: false,
					error: { code: "diff-missing", message: `${request.fromCommit}..${request.toCommit}` },
				}
			: { ok: true, value: { ...found, changedPaths: [...found.changedPaths] } };
	}
}

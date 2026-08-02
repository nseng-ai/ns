import type {
	ArtifactCandidate,
	CorpusCheckGateway,
	GatewayError,
	GatewayResult,
	TreeInventoryEntry,
} from "../core/index.ts";

type FailureKey = keyof CorpusCheckGateway;
export interface InMemoryCorpusCheckGatewayState {
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
function result<T>(failure: GatewayError | undefined, value: T): GatewayResult<T> {
	return failure === undefined ? { ok: true, value } : { ok: false, error: { ...failure } };
}
export class InMemoryCorpusCheckGateway implements CorpusCheckGateway {
	private readonly state: InMemoryCorpusCheckGatewayState;
	private readonly operations: string[] = [];
	constructor(state: InMemoryCorpusCheckGatewayState = {}) {
		this.state = structuredClone(state);
	}
	operationLog(): readonly string[] {
		return [...this.operations];
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

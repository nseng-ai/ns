import type {
	GsBranchRef,
	GsGitResult,
	GsGitState,
	GsRestackGitGateway,
	GsWorktreeOccupancy,
} from "../restack-git.ts";
import type {
	GsCommandDiagnostic,
	GsProviderResult,
	GsProviderTopology,
	GsStackProviderGateway,
} from "../stack-provider.ts";

export interface InMemoryRestackOptions {
	readonly version?: string;
	readonly topology?: GsProviderTopology;
	readonly afterTopology?: GsProviderTopology;
	readonly topologyFailure?: GsCommandDiagnostic;
	readonly afterTopologyFailure?: GsCommandDiagnostic;
	readonly gitState: GsGitState;
	readonly afterGitState?: GsGitState;
	readonly refs?: readonly GsBranchRef[];
	readonly afterRefs?: readonly GsBranchRef[];
	readonly occupancies?: readonly GsWorktreeOccupancy[];
	readonly providerFailure?: GsCommandDiagnostic;
	readonly ancestry?: boolean;
}

export class InMemoryGsStackProviderGateway implements GsStackProviderGateway {
	readonly operations: Array<
		"read-version" | "read-topology" | "start-full" | "start-downstack" | "continue"
	> = [];
	private advanced = false;
	private readonly options: InMemoryRestackOptions;

	constructor(options: InMemoryRestackOptions) {
		this.options = options;
	}

	async readVersion(): Promise<GsProviderResult<string>> {
		this.operations.push("read-version");
		return { ok: true, value: this.options.version ?? "0.1.0" };
	}

	async readTopology(): Promise<GsProviderResult<GsProviderTopology>> {
		this.operations.push("read-topology");
		const failure = this.advanced
			? this.options.afterTopologyFailure
			: this.options.topologyFailure;
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		const topology = this.advanced
			? (this.options.afterTopology ?? this.options.topology)
			: this.options.topology;
		if (topology === undefined) throw new Error("In-memory topology is required.");
		return { ok: true, value: copyTopology(topology) };
	}

	async startRestack(scope: "full" | "downstack"): Promise<GsProviderResult<null>> {
		this.operations.push(scope === "full" ? "start-full" : "start-downstack");
		this.advanced = true;
		return this.options.providerFailure === undefined
			? { ok: true, value: null }
			: { ok: false, error: { ...this.options.providerFailure } };
	}

	async continueRestack(): Promise<GsProviderResult<null>> {
		this.operations.push("continue");
		this.advanced = true;
		return this.options.providerFailure === undefined
			? { ok: true, value: null }
			: { ok: false, error: { ...this.options.providerFailure } };
	}
}

export class InMemoryGsRestackGitGateway implements GsRestackGitGateway {
	private reads = 0;
	private readonly options: InMemoryRestackOptions;

	constructor(options: InMemoryRestackOptions) {
		this.options = options;
	}

	async readState(): Promise<GsGitResult<GsGitState>> {
		const state =
			this.reads++ === 0
				? this.options.gitState
				: (this.options.afterGitState ?? this.options.gitState);
		return { ok: true, value: copyState(state) };
	}

	async readBranchRefs(branches: readonly string[]): Promise<GsGitResult<readonly GsBranchRef[]>> {
		const refs =
			this.reads > 1
				? (this.options.afterRefs ?? this.options.refs ?? [])
				: (this.options.refs ?? []);
		return {
			ok: true,
			value: refs.filter((ref) => branches.includes(ref.name)).map((ref) => ({ ...ref })),
		};
	}

	async readWorktreeOccupancy(): Promise<GsGitResult<readonly GsWorktreeOccupancy[]>> {
		return { ok: true, value: (this.options.occupancies ?? []).map((item) => ({ ...item })) };
	}

	async isAncestor(): Promise<GsGitResult<boolean>> {
		return { ok: true, value: this.options.ancestry ?? true };
	}
}

function copyState(state: GsGitState): GsGitState {
	return { ...state, checkout: { ...state.checkout }, unmergedPaths: [...state.unmergedPaths] };
}

function copyTopology(topology: GsProviderTopology): GsProviderTopology {
	return { ...topology, branches: topology.branches.map((branch) => ({ ...branch })) };
}

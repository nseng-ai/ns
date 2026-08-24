import type {
	GsGitInspectionResult,
	GsRestackGitGateway,
	GsRestackGitState,
} from "../restack-git.ts";
import type {
	GsProviderDiagnostic,
	GsProviderResult,
	GsRestackProviderGateway,
} from "../restack-provider.ts";

export interface InMemoryGsRestackOptions {
	readonly version?: string;
	readonly before: GsRestackGitState;
	readonly after?: GsRestackGitState;
	readonly providerDiagnostic?: GsProviderDiagnostic;
}

export class InMemoryGsRestackProviderGateway implements GsRestackProviderGateway {
	readonly mutations: Array<"start-full" | "start-downstack" | "continue"> = [];
	private readonly options: InMemoryGsRestackOptions;

	constructor(options: InMemoryGsRestackOptions) {
		this.options = options;
	}

	async readVersion(): Promise<GsProviderResult<string>> {
		return { ok: true, value: this.options.version ?? "0.1.0" };
	}

	async start(scope: "full" | "downstack"): Promise<GsProviderResult<null>> {
		this.mutations.push(scope === "full" ? "start-full" : "start-downstack");
		return this.mutationResult();
	}

	async continue(): Promise<GsProviderResult<null>> {
		this.mutations.push("continue");
		return this.mutationResult();
	}

	private mutationResult(): GsProviderResult<null> {
		return this.options.providerDiagnostic === undefined
			? { ok: true, value: null }
			: { ok: false, diagnostic: { ...this.options.providerDiagnostic } };
	}
}

export class InMemoryGsRestackGitGateway implements GsRestackGitGateway {
	private inspections = 0;
	private readonly options: InMemoryGsRestackOptions;

	constructor(options: InMemoryGsRestackOptions) {
		this.options = options;
	}

	async inspect(): Promise<GsGitInspectionResult> {
		const state =
			this.inspections++ === 0 ? this.options.before : (this.options.after ?? this.options.before);
		return { ok: true, state: copyState(state) };
	}
}

function copyState(state: GsRestackGitState): GsRestackGitState {
	return { ...state, unmergedPaths: [...state.unmergedPaths] };
}

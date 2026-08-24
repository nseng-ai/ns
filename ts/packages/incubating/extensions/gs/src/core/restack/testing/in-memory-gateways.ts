import type { GsGitInspectionResult, GsRestackGitGateway, GsRestackGitState } from "../git.ts";
import type { GsRestackDiagnostic, GsRestackGatewayResult, GsRestackGateway } from "../gateway.ts";

export interface InMemoryGsRestackOptions {
	readonly version?: string;
	readonly before: GsRestackGitState;
	readonly after?: GsRestackGitState;
	readonly restackDiagnostic?: GsRestackDiagnostic;
}

export class InMemoryGsRestackGateway implements GsRestackGateway {
	readonly mutations: Array<"start-full" | "start-downstack" | "continue"> = [];
	private readonly options: InMemoryGsRestackOptions;

	constructor(options: InMemoryGsRestackOptions) {
		this.options = options;
	}

	async readVersion(): Promise<GsRestackGatewayResult<string>> {
		return { ok: true, value: this.options.version ?? "0.1.0" };
	}

	async start(scope: "full" | "downstack"): Promise<GsRestackGatewayResult<null>> {
		this.mutations.push(scope === "full" ? "start-full" : "start-downstack");
		return this.mutationResult();
	}

	async continue(): Promise<GsRestackGatewayResult<null>> {
		this.mutations.push("continue");
		return this.mutationResult();
	}

	private mutationResult(): GsRestackGatewayResult<null> {
		return this.options.restackDiagnostic === undefined
			? { ok: true, value: null }
			: { ok: false, diagnostic: { ...this.options.restackDiagnostic } };
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

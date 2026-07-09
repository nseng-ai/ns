import type {
	DeclaredExtensionsGateway,
	LoadDeclaredExtensionsParams,
	LoadDeclaredExtensionsResult,
} from "./declared-extensions.ts";

export interface InMemoryDeclaredExtensionsState {
	readonly result?: LoadDeclaredExtensionsResult;
}

export class InMemoryDeclaredExtensionsGateway implements DeclaredExtensionsGateway {
	private readonly result: LoadDeclaredExtensionsResult;
	private readonly loadLog: LoadDeclaredExtensionsParams[] = [];

	constructor(state: InMemoryDeclaredExtensionsState = {}) {
		this.result = copyLoadResult(state.result ?? { descriptors: [], diagnostics: [] });
	}

	async load(params: LoadDeclaredExtensionsParams): Promise<LoadDeclaredExtensionsResult> {
		this.loadLog.push({ repoRoot: params.repoRoot, specs: [...params.specs] });
		return copyLoadResult(this.result);
	}

	calls(): readonly LoadDeclaredExtensionsParams[] {
		return this.loadLog.map((call) => ({ repoRoot: call.repoRoot, specs: [...call.specs] }));
	}
}

function copyLoadResult(result: LoadDeclaredExtensionsResult): LoadDeclaredExtensionsResult {
	return structuredClone(result);
}

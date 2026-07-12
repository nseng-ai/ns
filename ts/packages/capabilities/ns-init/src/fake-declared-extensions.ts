import type { LoadDeclaredExtensionDescriptorsResult } from "@nseng-ai/sdk/extensions/declared-descriptors";

import type {
	DeclaredExtensionsGateway,
	LoadDeclaredExtensionsParams,
} from "./declared-extensions.ts";

export interface InMemoryDeclaredExtensionsState {
	readonly result?: LoadDeclaredExtensionDescriptorsResult;
}

export class InMemoryDeclaredExtensionsGateway implements DeclaredExtensionsGateway {
	private readonly result: LoadDeclaredExtensionDescriptorsResult;
	private readonly loadLog: LoadDeclaredExtensionsParams[] = [];

	constructor(state: InMemoryDeclaredExtensionsState = {}) {
		this.result = copyLoadResult(state.result ?? { descriptors: [], diagnostics: [] });
	}

	async load(
		params: LoadDeclaredExtensionsParams,
	): Promise<LoadDeclaredExtensionDescriptorsResult> {
		this.loadLog.push({ repoRoot: params.repoRoot, specs: [...params.specs] });
		return copyLoadResult(this.result);
	}

	calls(): readonly LoadDeclaredExtensionsParams[] {
		return this.loadLog.map((call) => ({ repoRoot: call.repoRoot, specs: [...call.specs] }));
	}
}

function copyLoadResult(
	result: LoadDeclaredExtensionDescriptorsResult,
): LoadDeclaredExtensionDescriptorsResult {
	return structuredClone(result);
}

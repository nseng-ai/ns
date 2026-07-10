import {
	loadDeclaredExtensionDescriptors,
	type LoadDeclaredExtensionDescriptorsResult,
} from "@nseng-ai/kernel/extensions/declared-descriptors";

export interface LoadDeclaredExtensionsParams {
	readonly repoRoot: string;
	readonly specs: readonly string[];
}

export interface DeclaredExtensionsGateway {
	load(params: LoadDeclaredExtensionsParams): Promise<LoadDeclaredExtensionDescriptorsResult>;
}

export class RealDeclaredExtensionsGateway implements DeclaredExtensionsGateway {
	async load(
		params: LoadDeclaredExtensionsParams,
	): Promise<LoadDeclaredExtensionDescriptorsResult> {
		return loadDeclaredExtensionDescriptors(params);
	}
}

import {
	loadDeclaredExtensionDescriptors,
	type DeclaredExtensionDescriptor,
	type DeclaredExtensionDescriptorDiagnostic,
} from "@nseng-ai/kernel/extensions/declared-descriptors";

export interface LoadDeclaredExtensionsParams {
	readonly repoRoot: string;
	readonly specs: readonly string[];
}

export interface LoadDeclaredExtensionsResult {
	readonly descriptors: readonly DeclaredExtensionDescriptor[];
	readonly diagnostics: readonly DeclaredExtensionDescriptorDiagnostic[];
}

export interface DeclaredExtensionsGateway {
	load(params: LoadDeclaredExtensionsParams): Promise<LoadDeclaredExtensionsResult>;
}

export class RealDeclaredExtensionsGateway implements DeclaredExtensionsGateway {
	async load(params: LoadDeclaredExtensionsParams): Promise<LoadDeclaredExtensionsResult> {
		return loadDeclaredExtensionDescriptors(params);
	}
}

import {
	loadDeclaredExtensionDescriptors,
	type DeclaredExtensionNpmPackageRootResolver,
	type LoadDeclaredExtensionDescriptorsResult,
} from "@nseng-ai/sdk/extensions/declared-descriptors";

export interface LoadDeclaredExtensionsParams {
	readonly repoRoot: string;
	readonly specs: readonly string[];
	readonly localPathPolicy?: "project-relative" | "absolute-only";
	readonly resolveNpmPackageRoot?: DeclaredExtensionNpmPackageRootResolver;
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

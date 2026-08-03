import {
	loadDeclaredExtensionDescriptors,
	type DeclaredExtensionNpmPackageRootResolver,
	type LoadDeclaredExtensionDescriptorsResult,
} from "@nseng-ai/sdk/extensions/declared-descriptors";
import {
	evaluateUserExtensionPackageAvailability,
	type UserExtensionPackageAvailabilityFact,
} from "@nseng-ai/sdk/extensions/user-package-availability";
import type { PreinstalledNsCommandCatalogLoader } from "@nseng-ai/sdk/cli";

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

export interface UserExtensionAvailabilityGateway {
	evaluate(params: {
		readonly configDir: string;
		readonly sourceSpecs: readonly string[];
	}): Promise<readonly UserExtensionPackageAvailabilityFact[]>;
}

export class RealUserExtensionAvailabilityGateway implements UserExtensionAvailabilityGateway {
	private readonly preinstalledCommandCatalog: PreinstalledNsCommandCatalogLoader;

	constructor(preinstalledCommandCatalog: PreinstalledNsCommandCatalogLoader) {
		this.preinstalledCommandCatalog = preinstalledCommandCatalog;
	}

	async evaluate(params: {
		readonly configDir: string;
		readonly sourceSpecs: readonly string[];
	}): Promise<readonly UserExtensionPackageAvailabilityFact[]> {
		return evaluateUserExtensionPackageAvailability({
			...params,
			preinstalledCommandCatalog: this.preinstalledCommandCatalog,
			resolveNpmPackageRoot: () => undefined,
		});
	}
}

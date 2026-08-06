import {
	loadDeclaredExtensionDescriptors,
	type DeclaredExtensionNpmPackageRootResolver,
	type LoadDeclaredExtensionDescriptorsResult,
} from "@nseng-ai/sdk/extensions/declared-descriptors";
import {
	evaluateUserExtensionPackageAvailability,
	type UserExtensionPackageAvailabilityFact,
} from "@nseng-ai/sdk/extensions/user-package-availability";
import type { PreinstalledNsCommandSourceLoader } from "@nseng-ai/sdk/cli";

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
		readonly npmPackageRootOverride?: {
			readonly sourceSpec: string;
			readonly packageName: string;
			readonly moduleRoot: string;
		};
	}): Promise<readonly UserExtensionPackageAvailabilityFact[]>;
}

export class RealUserExtensionAvailabilityGateway implements UserExtensionAvailabilityGateway {
	private readonly preinstalledSources: PreinstalledNsCommandSourceLoader;
	private readonly resolveNpmPackageRoot: DeclaredExtensionNpmPackageRootResolver;

	constructor(
		preinstalledSources: PreinstalledNsCommandSourceLoader,
		resolveNpmPackageRoot: DeclaredExtensionNpmPackageRootResolver,
	) {
		this.preinstalledSources = preinstalledSources;
		this.resolveNpmPackageRoot = resolveNpmPackageRoot;
	}

	async evaluate(params: {
		readonly configDir: string;
		readonly sourceSpecs: readonly string[];
		readonly npmPackageRootOverride?: {
			readonly sourceSpec: string;
			readonly packageName: string;
			readonly moduleRoot: string;
		};
	}): Promise<readonly UserExtensionPackageAvailabilityFact[]> {
		const override = params.npmPackageRootOverride;
		return evaluateUserExtensionPackageAvailability({
			configDir: params.configDir,
			sourceSpecs: params.sourceSpecs,
			preinstalledSources: this.preinstalledSources,
			resolveNpmPackageRoot: (packageName, sourceSpec) =>
				override?.packageName === packageName && override.sourceSpec === sourceSpec
					? override.moduleRoot
					: this.resolveNpmPackageRoot(packageName, sourceSpec),
		});
	}
}

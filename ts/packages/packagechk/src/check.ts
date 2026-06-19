import type { PackageRegistryGateway } from "./registry-gateways.ts";
import type { PackageCheckReport, Registry, RegistryCheckResult } from "./models.ts";

export const DEFAULT_REGISTRIES: readonly Registry[] = ["pypi", "npm", "brew"];

export function registrySelection(registryOptions: readonly Registry[]): readonly Registry[] {
	return registryOptions.length === 0 ? DEFAULT_REGISTRIES : [...registryOptions];
}

export async function checkPackageName(options: {
	packageName: string;
	registries: readonly Registry[];
	registryGateway: PackageRegistryGateway;
}): Promise<PackageCheckReport> {
	const results: RegistryCheckResult[] = [];
	for (const registry of options.registries) {
		results.push(
			await checkRegistry({
				packageName: options.packageName,
				registry,
				registryGateway: options.registryGateway,
			}),
		);
	}
	return { inputName: options.packageName, results };
}

async function checkRegistry(options: {
	packageName: string;
	registry: Registry;
	registryGateway: PackageRegistryGateway;
}): Promise<RegistryCheckResult> {
	switch (options.registry) {
		case "pypi":
			return await options.registryGateway.checkPypi(options.packageName);
		case "npm":
			return await options.registryGateway.checkNpm(options.packageName);
		case "brew":
			return await options.registryGateway.checkBrew(options.packageName);
	}
	const exhaustive: never = options.registry;
	return exhaustive;
}

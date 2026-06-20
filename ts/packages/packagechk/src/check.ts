import {
	REGISTRIES,
	type PackageCheckReport,
	type Registry,
	type RegistryCheckResult,
} from "./models.ts";
import type { PackageRegistryGateway } from "./registry-gateways.ts";

export function registrySelection(registryOptions: readonly Registry[]): readonly Registry[] {
	return registryOptions.length === 0 ? REGISTRIES : [...registryOptions];
}

export async function checkPackageName(options: {
	packageName: string;
	registries: readonly Registry[];
	registryGateway: PackageRegistryGateway;
}): Promise<PackageCheckReport> {
	const results = await Promise.all(
		options.registries.map((registry) =>
			checkRegistry({
				packageName: options.packageName,
				registry,
				registryGateway: options.registryGateway,
			}),
		),
	);
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

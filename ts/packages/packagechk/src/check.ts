import type { PackageRegistryGateway } from "./gateways.ts";
import { unsupportedResult, type PackageCheckReport, type Registry } from "./models.ts";

export const DEFAULT_REGISTRIES: readonly Registry[] = ["pypi", "npm", "brew"];

export function registrySelection(registryOptions: readonly Registry[]): readonly Registry[] {
	return registryOptions.length === 0 ? DEFAULT_REGISTRIES : [...registryOptions];
}

export async function checkPackageName(options: {
	packageName: string;
	registries: readonly Registry[];
	registryGateway: PackageRegistryGateway;
}): Promise<PackageCheckReport> {
	const results = [];
	for (const registry of options.registries) {
		switch (registry) {
			case "pypi":
				results.push(await options.registryGateway.checkPypi(options.packageName));
				break;
			case "npm":
				results.push(await options.registryGateway.checkNpm(options.packageName));
				break;
			case "brew":
				results.push(await options.registryGateway.checkBrew(options.packageName));
				break;
			default:
				results.push(
					unsupportedResult(registry, {
						inputName: options.packageName,
						message: `${registry} availability checks are not supported`,
					}),
				);
		}
	}
	return { inputName: options.packageName, results };
}

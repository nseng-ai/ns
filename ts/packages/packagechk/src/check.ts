import { REGISTRIES, type PackageCheckReport, type Registry } from "./models.ts";
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
			options.registryGateway.check(registry, options.packageName),
		),
	);
	return { inputName: options.packageName, results };
}

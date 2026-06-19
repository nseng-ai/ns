export const REGISTRIES = ["pypi", "npm", "brew"] as const;
export type Registry = (typeof REGISTRIES)[number];

export const CHECK_STATUSES = ["available", "taken", "invalid", "unsupported", "error"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export interface RegistryCheckResult {
	registry: Registry;
	inputName: string;
	lookupName: string;
	status: CheckStatus;
	message: string;
	packageUrl?: string;
	latestVersion?: string;
	description?: string;
}

export interface PackageCheckReport {
	inputName: string;
	results: readonly RegistryCheckResult[];
}

export function availableResult(
	registry: Registry,
	options: { inputName: string; lookupName: string },
): RegistryCheckResult {
	return {
		registry,
		inputName: options.inputName,
		lookupName: options.lookupName,
		status: "available",
		message: `${registry} package name is available`,
	};
}

export function takenResult(
	registry: Registry,
	options: {
		inputName: string;
		lookupName: string;
		packageUrl?: string;
		latestVersion?: string;
		description?: string;
	},
): RegistryCheckResult {
	return {
		registry,
		inputName: options.inputName,
		lookupName: options.lookupName,
		status: "taken",
		message: `${registry} package name is already taken`,
		...(options.packageUrl === undefined ? {} : { packageUrl: options.packageUrl }),
		...(options.latestVersion === undefined ? {} : { latestVersion: options.latestVersion }),
		...(options.description === undefined ? {} : { description: options.description }),
	};
}

export function invalidResult(
	registry: Registry,
	options: { inputName: string; lookupName: string; message: string },
): RegistryCheckResult {
	return {
		registry,
		inputName: options.inputName,
		lookupName: options.lookupName,
		status: "invalid",
		message: options.message,
	};
}

export function unsupportedResult(
	registry: Registry,
	options: { inputName: string; message: string },
): RegistryCheckResult {
	return {
		registry,
		inputName: options.inputName,
		lookupName: options.inputName,
		status: "unsupported",
		message: options.message,
	};
}

export function errorResult(
	registry: Registry,
	options: { inputName: string; lookupName: string; message: string },
): RegistryCheckResult {
	return {
		registry,
		inputName: options.inputName,
		lookupName: options.lookupName,
		status: "error",
		message: options.message,
	};
}

export function reportExitCode(report: PackageCheckReport): number {
	const statuses = new Set(report.results.map((result) => result.status));
	if (statuses.has("invalid")) return 2;
	if (statuses.has("unsupported")) return 2;
	if (statuses.has("error")) return 2;
	if (statuses.has("taken")) return 1;
	return 0;
}

export function registryCheckResultToJson(result: RegistryCheckResult): Record<string, string> {
	return {
		registry: result.registry,
		input_name: result.inputName,
		lookup_name: result.lookupName,
		status: result.status,
		message: result.message,
		...(result.packageUrl === undefined ? {} : { package_url: result.packageUrl }),
		...(result.latestVersion === undefined ? {} : { latest_version: result.latestVersion }),
		...(result.description === undefined ? {} : { description: result.description }),
	};
}

export function reportToJson(report: PackageCheckReport): Record<string, unknown> {
	return {
		schema_version: 1,
		name: report.inputName,
		exit_code: reportExitCode(report),
		results: report.results.map(registryCheckResultToJson),
	};
}

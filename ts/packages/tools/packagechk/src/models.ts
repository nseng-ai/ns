export const REGISTRIES = ["pypi", "npm", "brew"] as const;
export type Registry = (typeof REGISTRIES)[number];

export const CHECK_STATUSES = ["available", "taken", "invalid", "error"] as const;
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

export interface RegistryCheckMetadataFields {
	packageUrl?: string;
	latestVersion?: string;
	description?: string;
}

export interface RegistryCheckMetadataInput {
	packageUrl?: string;
	latestVersion?: string;
	description?: string;
}

export function registryCheckMetadataFields(
	fields: RegistryCheckMetadataInput,
): RegistryCheckMetadataFields {
	const metadata: RegistryCheckMetadataFields = {};
	if (fields.packageUrl !== undefined) metadata.packageUrl = fields.packageUrl;
	if (fields.latestVersion !== undefined) metadata.latestVersion = fields.latestVersion;
	if (fields.description !== undefined) metadata.description = fields.description;
	return metadata;
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
		...registryCheckMetadataFields(options),
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
	if (statuses.has("error")) return 2;
	if (statuses.has("taken")) return 1;
	return 0;
}

export function registryCheckResultToJson(result: RegistryCheckResult): Record<string, string> {
	return {
		registry: result.registry,
		inputName: result.inputName,
		lookupName: result.lookupName,
		status: result.status,
		message: result.message,
		...registryCheckMetadataFields(result),
	};
}

export function reportToJson(report: PackageCheckReport): Record<string, unknown> {
	return {
		schemaVersion: 1,
		name: report.inputName,
		exitCode: reportExitCode(report),
		results: report.results.map(registryCheckResultToJson),
	};
}

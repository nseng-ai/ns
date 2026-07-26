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

export type CheckStatusHumanKind = "available" | "taken" | "status-line";
export type CheckStatusClaimPrecheckAction = "continue" | "taken" | "usage-error" | "failure";

export interface CheckStatusPolicy {
	reportExitCode: number;
	humanKind: CheckStatusHumanKind;
	claimPrecheckAction: CheckStatusClaimPrecheckAction;
}

export const CHECK_STATUS_POLICIES = {
	available: {
		reportExitCode: 0,
		humanKind: "available",
		claimPrecheckAction: "continue",
	},
	taken: {
		reportExitCode: 1,
		humanKind: "taken",
		claimPrecheckAction: "taken",
	},
	invalid: {
		reportExitCode: 2,
		humanKind: "status-line",
		claimPrecheckAction: "usage-error",
	},
	error: {
		reportExitCode: 2,
		humanKind: "status-line",
		claimPrecheckAction: "failure",
	},
} as const satisfies Record<CheckStatus, CheckStatusPolicy>;

export function checkStatusPolicy(status: CheckStatus): CheckStatusPolicy {
	return CHECK_STATUS_POLICIES[status];
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
	return {
		...(fields.packageUrl === undefined ? {} : { packageUrl: fields.packageUrl }),
		...(fields.latestVersion === undefined ? {} : { latestVersion: fields.latestVersion }),
		...(fields.description === undefined ? {} : { description: fields.description }),
	};
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
	return Math.max(
		0,
		...report.results.map((result) => checkStatusPolicy(result.status).reportExitCode),
	);
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
